# Product Features & Workspace Architecture

## Workspace Architecture ("The Container")
Every workspace operates identically regardless of its real-world context (family, project, business).

### 1. Workspace Structural Elements
* **Channels (Chat):** Categorized text channels, direct messages, and thread discussions.
* **Shared Calendar:** Workspace schedule with color-coded categories and recurring event logic.
* **Shared Planner:** Kanban task boards, checklists, assignment tags, and due dates.
* **Workspace Finance Ledger:** Manual transaction log, balance summary, category tags, and split calculators.

---

## Cross-Workspace Aggregation (User Account Level)

While data is scoped strictly to individual workspaces, the user account acts as a personal aggregator across three primary surfaces:

1. **Unified Calendar Overlay:** Overlays events from all joined workspaces into one master schedule.
   * **Privacy Masking Rule:** A user can configure Event Visibility per workspace. For example, an event created in "Side-Biz" can display as simply *"Busy"* on the "Family" workspace schedule to avoid scheduling conflicts without revealing sensitive details.
2. **Consolidated "My Tasks" Feed:** Displays every task assigned to the user across all joined workspaces, sorted by due date and priority.
3. **Master Financial Feed:** Combines personal financial entries with workspace expense logs for a complete personal cash-flow overview.

---

## Manual Finance Module Specifications

Manual input is marketed as an intentional feature for privacy and control.

* **Single Transaction Logging:** Quick modal to input Amount, Date, Category, Payer, and Split Allocations.
* **Settlement Engine:** Automated "Who owes who what" calculation within shared workspaces (roommates/groups).
* **Recurring Expense Logs:** Manual prompt/reminder to log monthly fixed costs (Rent, Subscriptions) without automated bank scraping.