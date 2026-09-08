package recurrence

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/teambition/rrule-go"
)

const EntityEvent = "event"
const EntityIncome = "income"
const EntityBill = "bill"
const EntityTodoList = "todo_list"

const ActionCancelled = "cancelled"
const ActionModified = "modified"

// WeeklyChecklistRule is kept for backward compatibility with existing series rows.
const WeeklyChecklistRule = "FREQ=WEEKLY;INTERVAL=1;SCOPE=WEEK"

type Exception struct {
	OccurrenceAt time.Time
	Action       string
	OverrideJSON string
}

type OccurrenceState struct {
	OccurrenceAt   time.Time
	Paid           bool
	PaidAt         *string
	AmountOverride *float64
	PaymentNotes   *string
	Skipped        bool
}

type Series struct {
	ID        int
	StartAt   time.Time
	EndAt     time.Time
	RRule     string
	AllDay    bool
	Duration  time.Duration
	DateOnly  bool
}

func NormalizeRule(rule string) string {
	rule = strings.TrimSpace(rule)
	if rule == "" || strings.EqualFold(rule, "none") {
		return ""
	}

	// Legacy bill_dashboard stored full iCal snippets, e.g.
	// DTSTART:20250713T050000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=13
	rule = strings.ReplaceAll(rule, `\n`, "\n")
	upper := strings.ToUpper(rule)
	if idx := strings.Index(upper, "RRULE:"); idx >= 0 {
		rule = rule[idx+len("RRULE:"):]
		if newline := strings.Index(rule, "\n"); newline >= 0 {
			rule = rule[:newline]
		}
	}

	return strings.TrimSpace(rule)
}

func IsRecurring(rule string) bool {
	return NormalizeRule(rule) != ""
}

func IsWeeklyChecklistScope(rule string) bool {
	scope, ok := ParsePeriodScope(rule)
	return ok && scope == "week"
}

func IsPeriodicChecklistScope(rule string) bool {
	_, ok := ParsePeriodScope(rule)
	return ok
}

func ParsePeriodScope(rule string) (string, bool) {
	rule = strings.ToUpper(NormalizeRule(rule))
	for _, scope := range []string{"WEEK", "MONTH", "YEAR"} {
		if strings.Contains(rule, "SCOPE="+scope) {
			return strings.ToLower(scope), true
		}
	}
	return "", false
}

func PeriodicChecklistRule(scope string) string {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "month":
		return "FREQ=MONTHLY;INTERVAL=1;SCOPE=MONTH"
	case "year":
		return "FREQ=YEARLY;INTERVAL=1;SCOPE=YEAR"
	default:
		return WeeklyChecklistRule
	}
}

// PeriodStartUTC returns the start of the calendar period containing value.
func PeriodStartUTC(value time.Time, scope string) time.Time {
	day := dateOnlyUTC(value)
	switch strings.ToLower(scope) {
	case "month":
		return time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, time.UTC)
	case "year":
		return time.Date(day.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	default:
		return WeekStartUTC(day)
	}
}

// PeriodStartFromISODate parses YYYY-MM-DD and returns the period start in UTC.
func PeriodStartFromISODate(raw, scope string) (time.Time, error) {
	parsed, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return time.Time{}, err
	}
	return PeriodStartUTC(parsed, scope), nil
}

// WeekStartUTC returns the Sunday that starts the calendar week containing value.
func WeekStartUTC(value time.Time) time.Time {
	day := dateOnlyUTC(value)
	offset := int(day.Weekday())
	return day.AddDate(0, 0, -offset)
}

// WeekStartFromISODate parses YYYY-MM-DD and returns the Sunday week start in UTC.
func WeekStartFromISODate(raw string) (time.Time, error) {
	parsed, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return time.Time{}, err
	}
	return WeekStartUTC(parsed), nil
}

func OccurrenceID(seriesID int, occurrenceAt time.Time, dateOnly bool) string {
	if dateOnly {
		return formatDateKey(seriesID, occurrenceAt)
	}
	return formatDateTimeKey(seriesID, occurrenceAt.UTC())
}

func ParseOccurrenceID(raw string) (seriesID int, occurrenceAt time.Time, ok bool) {
	parts := strings.SplitN(raw, ":", 2)
	if len(parts) != 2 {
		return 0, time.Time{}, false
	}
	id, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, time.Time{}, false
	}
	at, err := time.Parse(time.RFC3339, parts[1])
	if err != nil {
		at, err = time.Parse("2006-01-02", parts[1])
		if err != nil {
			return 0, time.Time{}, false
		}
	}
	return id, at, true
}

func ExpandSeries(series Series, from, to time.Time, exceptions []Exception) []time.Time {
	if series.DateOnly {
		from = dateOnlyUTC(from)
		to = dateOnlyEndUTC(to)
		series.StartAt = dateOnlyUTC(series.StartAt)
	}

	rule := NormalizeRule(series.RRule)
	if rule == "" {
		if !series.StartAt.Before(from) && !series.StartAt.After(to) {
			return []time.Time{series.StartAt}
		}
		return nil
	}

	coreRule, adjustWeekendPrevious := stripExtensions(rule)
	set, err := buildRuleSet(series, coreRule)
	if err != nil {
		return nil
	}

	start := from
	if series.StartAt.After(start) {
		start = series.StartAt
	}

	times := set.Between(start, to, true)
	if len(times) == 0 && !series.StartAt.Before(from) && !series.StartAt.After(to) {
		times = []time.Time{series.StartAt}
	}

	filtered := make([]time.Time, 0, len(times))
	exceptionMap := mapExceptions(exceptions, series.DateOnly)
	seen := map[string]struct{}{}
	for _, at := range times {
		if adjustWeekendPrevious {
			at = AdjustToPreviousWeekday(at)
		}
		key := occurrenceKey(at, series.DateOnly)
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}

		ex, ok := exceptionMap[key]
		if ok && ex.Action == ActionCancelled {
			continue
		}
		filtered = append(filtered, at)
	}
	return filtered
}

// AdjustToPreviousWeekday moves Saturday to Friday and Sunday to Friday.
func AdjustToPreviousWeekday(at time.Time) time.Time {
	switch at.Weekday() {
	case time.Saturday:
		return at.AddDate(0, 0, -1)
	case time.Sunday:
		return at.AddDate(0, 0, -2)
	default:
		return at
	}
}

func ApplyEventOverride(baseStart, baseEnd time.Time, at time.Time, duration time.Duration, ex *Exception) (time.Time, time.Time) {
	if ex == nil || ex.Action != ActionModified || ex.OverrideJSON == "" {
		return at, at.Add(duration)
	}

	var override struct {
		StartAt string `json:"start_at"`
		EndAt   string `json:"end_at"`
	}
	if err := json.Unmarshal([]byte(ex.OverrideJSON), &override); err != nil {
		return at, at.Add(duration)
	}

	startAt, err := parseFlexibleTime(override.StartAt)
	if err != nil {
		startAt = at
	}
	endAt, err := parseFlexibleTime(override.EndAt)
	if err != nil {
		endAt = startAt.Add(duration)
	}
	return startAt, endAt
}

func ApplyFinanceOverride(at time.Time, amount float64, ex *Exception, state *OccurrenceState) (time.Time, float64) {
	if state != nil && state.AmountOverride != nil {
		amount = *state.AmountOverride
	}
	if ex != nil && ex.Action == ActionModified && ex.OverrideJSON != "" {
		var override struct {
			Date   string  `json:"date"`
			Amount float64 `json:"amount"`
		}
		if err := json.Unmarshal([]byte(ex.OverrideJSON), &override); err == nil {
			if override.Date != "" {
				if parsed, err := time.Parse("2006-01-02", override.Date); err == nil {
					at = parsed
				}
			}
			if override.Amount > 0 {
				amount = override.Amount
			}
		}
	}
	return at, amount
}

func TruncateRule(rule string, before time.Time) string {
	rule = NormalizeRule(rule)
	if rule == "" {
		return ""
	}
	until := before.Add(-time.Second).UTC().Format("20060102T150405Z")
	if strings.Contains(strings.ToUpper(rule), "UNTIL=") {
		return replaceUntil(rule, until)
	}
	if strings.Contains(strings.ToUpper(rule), "COUNT=") {
		rule = removeToken(rule, "COUNT")
	}
	if !strings.HasSuffix(rule, ";") {
		rule += ";"
	}
	return rule + "UNTIL=" + until
}

func SplitRuleFrom(rule string, from time.Time) string {
	rule = NormalizeRule(rule)
	if rule == "" {
		return ""
	}
	if strings.Contains(strings.ToUpper(rule), "UNTIL=") {
		rule = removeToken(rule, "UNTIL")
	}
	if strings.Contains(strings.ToUpper(rule), "COUNT=") {
		rule = removeToken(rule, "COUNT")
	}
	return strings.TrimSuffix(rule, ";")
}

func buildRuleSet(series Series, rule string) (*rrule.Set, error) {
	dtStart := series.StartAt
	if series.DateOnly {
		dtStart = time.Date(series.StartAt.Year(), series.StartAt.Month(), series.StartAt.Day(), 0, 0, 0, 0, time.UTC)
	}
	return rrule.StrToRRuleSet("DTSTART:" + dtStart.Format("20060102T150405Z") + "\nRRULE:" + rule)
}

func stripExtensions(rule string) (string, bool) {
	parts := strings.Split(rule, ";")
	filtered := make([]string, 0, len(parts))
	adjustWeekendPrevious := false
	for _, part := range parts {
		upper := strings.ToUpper(strings.TrimSpace(part))
		if strings.HasPrefix(upper, "X-ADJUST-WEEKEND=") {
			value := strings.TrimPrefix(upper, "X-ADJUST-WEEKEND=")
			if value == "PREVIOUS" {
				adjustWeekendPrevious = true
			}
			continue
		}
		if upper == "SCOPE=WEEK" || upper == "SCOPE=MONTH" || upper == "SCOPE=YEAR" {
			continue
		}
		if part != "" {
			filtered = append(filtered, part)
		}
	}
	return strings.Join(filtered, ";"), adjustWeekendPrevious
}

func mapExceptions(exceptions []Exception, dateOnly bool) map[string]Exception {
	out := make(map[string]Exception, len(exceptions))
	for _, ex := range exceptions {
		out[occurrenceKey(ex.OccurrenceAt, dateOnly)] = ex
	}
	return out
}

func FindException(exceptions []Exception, at time.Time, dateOnly bool) *Exception {
	key := occurrenceKey(at, dateOnly)
	for i := range exceptions {
		if occurrenceKey(exceptions[i].OccurrenceAt, dateOnly) == key {
			return &exceptions[i]
		}
	}
	return nil
}

func occurrenceKey(at time.Time, dateOnly bool) string {
	if dateOnly {
		return at.Format("2006-01-02")
	}
	return at.UTC().Format(time.RFC3339)
}

func formatDateKey(seriesID int, at time.Time) string {
	return formatInt(seriesID) + ":" + at.Format("2006-01-02")
}

func formatDateTimeKey(seriesID int, at time.Time) string {
	return formatInt(seriesID) + ":" + at.Format(time.RFC3339)
}

func parseFlexibleTime(raw string) (time.Time, error) {
	if raw == "" {
		return time.Time{}, errEmptyTime
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}
	return time.Parse("2006-01-02", raw)
}

func replaceUntil(rule, until string) string {
	parts := strings.Split(rule, ";")
	for i, part := range parts {
		if strings.HasPrefix(strings.ToUpper(part), "UNTIL=") {
			parts[i] = "UNTIL=" + until
			return strings.Join(parts, ";")
		}
	}
	return rule + ";UNTIL=" + until
}

func removeToken(rule, token string) string {
	parts := strings.Split(rule, ";")
	filtered := make([]string, 0, len(parts))
	prefix := strings.ToUpper(token) + "="
	for _, part := range parts {
		if strings.HasPrefix(strings.ToUpper(part), prefix) {
			continue
		}
		filtered = append(filtered, part)
	}
	return strings.Join(filtered, ";")
}

var errEmptyTime = &timeParseError{}

type timeParseError struct{}

func (e *timeParseError) Error() string { return "empty time" }

func formatInt(value int) string {
	return strconv.Itoa(value)
}

func dateOnlyUTC(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func dateOnlyEndUTC(value time.Time) time.Time {
	day := dateOnlyUTC(value)
	return day.AddDate(0, 0, 1).Add(-time.Second)
}

// DateOnlyUTC normalizes a timestamp to midnight UTC on its calendar date.
func DateOnlyUTC(value time.Time) time.Time {
	return dateOnlyUTC(value)
}

// DateOnlyEndUTC returns the last second of the calendar date in UTC.
func DateOnlyEndUTC(value time.Time) time.Time {
	return dateOnlyEndUTC(value)
}
