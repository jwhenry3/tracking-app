package hub

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Message struct {
	Type        string          `json:"type"`
	WorkspaceID int             `json:"workspace_id,omitempty"`
	Entity      string          `json:"entity,omitempty"`
	Action      string          `json:"action,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	Username    string          `json:"username,omitempty"`
	Content     string          `json:"content,omitempty"`
	Timestamp   string          `json:"timestamp,omitempty"`
}

type Client struct {
	Hub          *Hub
	Conn         *websocket.Conn
	Send         chan []byte
	UserID       int
	Username     string
	WorkspaceIDs map[int]bool
	replaced     bool
}

func (c *Client) HasWorkspace(workspaceID int) bool {
	return c.WorkspaceIDs[workspaceID]
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan workspaceMessage
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

type workspaceMessage struct {
	WorkspaceID int
	Data        []byte
}

func New() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan workspaceMessage, 256),
		register:   make(chan *Client, 256),
		unregister: make(chan *Client, 256),
	}
}

func WorkspaceIDSet(ids []int) map[int]bool {
	set := make(map[int]bool, len(ids))
	for _, id := range ids {
		if id > 0 {
			set[id] = true
		}
	}
	return set
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) BroadcastWorkspace(workspaceID int, message Message) {
	message.WorkspaceID = workspaceID
	if message.Timestamp == "" {
		message.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	h.broadcast <- workspaceMessage{WorkspaceID: workspaceID, Data: data}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			for existing := range h.clients {
				if existing.UserID != client.UserID {
					continue
				}
				existing.replaced = true
				delete(h.clients, existing)
				close(existing.Send)
				go existing.Conn.Close()
			}
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			_, ok := h.clients[client]
			if ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			var stale []*Client
			for client := range h.clients {
				if !client.HasWorkspace(message.WorkspaceID) {
					continue
				}
				select {
				case client.Send <- message.Data:
				default:
					stale = append(stale, client)
				}
			}
			h.mu.RUnlock()

			if len(stale) > 0 {
				h.mu.Lock()
				for _, client := range stale {
					if _, ok := h.clients[client]; ok {
						close(client.Send)
						delete(h.clients, client)
					}
				}
				h.mu.Unlock()
			}
		}
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	for {
		if _, _, err := c.Conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *Client) WritePump() {
	defer c.Conn.Close()

	for message := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Println("websocket write error:", err)
			break
		}
	}
}
