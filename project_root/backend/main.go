package main

import (
	"database/sql"
	"log"
	"net/http"

	"fullstack-app/config"
	"fullstack-app/database"
	"fullstack-app/handlers"
	"fullstack-app/hub"
	"fullstack-app/middleware"

	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	db, err := sql.Open("mysql", cfg.DSN())
	if err != nil {
		log.Fatal("failed to open database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("database unreachable:", err)
	}

	if err := database.Migrate(db); err != nil {
		log.Fatal("database migration failed:", err)
	}

	if err := database.SeedChat(db); err != nil {
		log.Fatal("chat seed failed:", err)
	}

	messageHub := hub.New()
	go messageHub.Run()

	authHandler := &handlers.AuthHandler{DB: db, Cfg: cfg, Hub: messageHub}
	workspaceHandler := &handlers.WorkspaceHandler{DB: db, Hub: messageHub}
	chatHandler := &handlers.ChatHandler{DB: db, Hub: messageHub, UploadDir: cfg.UploadDir}
	eventHandler := &handlers.EventHandler{DB: db, Hub: messageHub}
	financeHandler := &handlers.FinanceHandler{DB: db, Hub: messageHub}
	todoHandler := &handlers.TodoHandler{DB: db, Hub: messageHub}
	wsHandler := &handlers.WSHandler{DB: db, Hub: messageHub, Cfg: cfg}

	r := gin.Default()
	r.Use(corsMiddleware(cfg.CORSOrigin))

	api := r.Group("/api")
	{
		api.POST("/register", authHandler.Register)
		api.POST("/login", authHandler.Login)
		api.POST("/forgot-password", authHandler.ForgotPassword)
		api.POST("/reset-password", authHandler.ResetPassword)
		api.GET("/me", middleware.JWTAuth(cfg.JWTSecret), authHandler.Me)
		api.PATCH("/me/settings", middleware.JWTAuth(cfg.JWTSecret), authHandler.UpdateProfileSettings)
		api.POST("/me/avatar", middleware.JWTAuth(cfg.JWTSecret), authHandler.UploadAvatar)
		api.GET("/me/avatar", middleware.JWTAuth(cfg.JWTSecret), authHandler.GetAvatar)
		api.DELETE("/me/avatar", middleware.JWTAuth(cfg.JWTSecret), authHandler.DeleteAvatar)

		api.GET("/workspaces", middleware.JWTAuth(cfg.JWTSecret), workspaceHandler.List)
		api.POST("/workspaces", middleware.JWTAuth(cfg.JWTSecret), workspaceHandler.Create)
		api.GET("/invites", middleware.JWTAuth(cfg.JWTSecret), workspaceHandler.ListMyInvites)
		api.POST("/invites/:inviteId/accept", middleware.JWTAuth(cfg.JWTSecret), workspaceHandler.AcceptInvite)
		api.POST("/invites/:inviteId/decline", middleware.JWTAuth(cfg.JWTSecret), workspaceHandler.DeclineInvite)

		ws := api.Group("/workspaces/:workspaceId", middleware.JWTAuth(cfg.JWTSecret), middleware.WorkspaceAccess(db))
		{
			ws.GET("", workspaceHandler.Get)
			ws.PATCH("/settings", workspaceHandler.UpdateSettings)
			ws.POST("/archive", workspaceHandler.Archive)
			ws.DELETE("/members/me", workspaceHandler.Leave)
			ws.GET("/members", workspaceHandler.ListMembers)
			ws.POST("/members", workspaceHandler.AddMember)
			ws.PATCH("/members/:userId", workspaceHandler.UpdateMember)
			ws.POST("/invites", workspaceHandler.InviteMember)
			ws.GET("/access-requests", workspaceHandler.ListAccessRequests)
			ws.PATCH("/access-requests/:requestId", workspaceHandler.ReviewAccessRequest)

			ws.GET("/chat/conversations", chatHandler.ListConversations)
			ws.GET("/chat/conversations/:conversationId/messages", chatHandler.ListMessages)
			ws.POST("/chat/conversations/:conversationId/messages", chatHandler.SendMessage)
			ws.GET("/chat/attachments/:attachmentId", chatHandler.GetAttachment)
			ws.POST("/chat/direct", chatHandler.CreateDirectConversation)

			ws.GET("/events", eventHandler.List)
			ws.GET("/events/series", eventHandler.ListSeries)
			ws.POST("/events", eventHandler.Create)
			ws.DELETE("/events/:eventId", eventHandler.Delete)
			ws.PATCH("/events/:eventId/occurrences/:occurrenceAt", eventHandler.PatchOccurrence)

			ws.GET("/finance/summary", financeHandler.Summary)
			ws.GET("/finance/income", financeHandler.ListIncome)
			ws.POST("/finance/income", financeHandler.CreateIncome)
			ws.PATCH("/finance/income/:incomeId/occurrences/:occurrenceAt", financeHandler.PatchIncomeOccurrence)
			ws.DELETE("/finance/income/:incomeId", financeHandler.DeleteIncome)
			ws.GET("/finance/bills", financeHandler.ListBills)
			ws.GET("/finance/bills/series", financeHandler.ListBillSeries)
			ws.POST("/finance/bills", financeHandler.CreateBill)
			ws.PATCH("/finance/bills/:billId/occurrences/:occurrenceAt", financeHandler.PatchBillOccurrence)
			ws.DELETE("/finance/bills/:billId", financeHandler.DeleteBill)
			ws.GET("/finance/expenses", financeHandler.ListExpenses)
			ws.POST("/finance/expenses", financeHandler.CreateExpense)
			ws.PATCH("/finance/expenses/:expenseId", financeHandler.PatchExpense)
			ws.DELETE("/finance/expenses/:expenseId", financeHandler.DeleteExpense)

			ws.GET("/todo-lists", todoHandler.ListLists)
			ws.POST("/todo-lists", todoHandler.CreateList)
			ws.GET("/todo-lists/daily/:date", todoHandler.EnsureDailyList)
			ws.GET("/todos", todoHandler.ListTodos)
			ws.POST("/todos", todoHandler.CreateTodo)
			ws.PATCH("/todos/:todoId", todoHandler.UpdateTodo)
			ws.DELETE("/todos/:todoId", todoHandler.DeleteTodo)
			ws.GET("/notes", todoHandler.ListNotes)
			ws.POST("/notes", todoHandler.CreateNote)
			ws.PATCH("/notes/:noteId", todoHandler.UpdateNote)
			ws.DELETE("/notes/:noteId", todoHandler.DeleteNote)
		}
	}

	r.GET("/ws", wsHandler.Serve)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	log.Printf("Server listening on http://localhost:%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(origin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
