package recurrence

import (
	"testing"
	"time"
)

func TestSemimonthlyPaydayWithWeekendAdjustment(t *testing.T) {
	// January 2026: 15th is Thursday, 31st is Saturday -> should adjust to Friday Jan 30
	series := Series{
		ID:       1,
		StartAt:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		RRule:    "FREQ=MONTHLY;BYMONTHDAY=15,-1;X-ADJUST-WEEKEND=PREVIOUS",
		DateOnly: true,
	}
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 23, 59, 59, 0, time.UTC)

	occurrences := ExpandSeries(series, from, to, nil)
	if len(occurrences) != 2 {
		t.Fatalf("expected 2 occurrences, got %d: %v", len(occurrences), occurrences)
	}

	if occurrences[0].Day() != 15 {
		t.Fatalf("expected first occurrence on the 15th, got %v", occurrences[0])
	}
	if occurrences[1].Weekday() != time.Friday || occurrences[1].Day() != 30 {
		t.Fatalf("expected last occurrence moved to Friday the 30th, got %v", occurrences[1])
	}
}

func TestNormalizeRuleLegacyICal(t *testing.T) {
	raw := "DTSTART:20250713T050000Z\nRRULE:BYMONTHDAY=13;FREQ=MONTHLY;INTERVAL=1"
	got := NormalizeRule(raw)
	want := "BYMONTHDAY=13;FREQ=MONTHLY;INTERVAL=1"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestExpandSeriesLegacyNormalizedRule(t *testing.T) {
	rule := NormalizeRule("DTSTART:20250713T050000Z\nRRULE:BYMONTHDAY=13;FREQ=MONTHLY;INTERVAL=1")
	series := Series{
		ID:       1,
		StartAt:  time.Date(2025, 7, 13, 0, 0, 0, 0, time.UTC),
		RRule:    rule,
		DateOnly: true,
	}
	from := time.Date(2025, 7, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2025, 9, 30, 23, 59, 59, 0, time.UTC)

	occurrences := ExpandSeries(series, from, to, nil)
	if len(occurrences) != 3 {
		t.Fatalf("expected 3 monthly occurrences, got %d: %v", len(occurrences), occurrences)
	}
}

func TestExpandSeriesWeeklyOnQueryDay(t *testing.T) {
	series := Series{
		ID:       1,
		StartAt:  time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC),
		RRule:    "FREQ=WEEKLY;BYDAY=MO",
		DateOnly: true,
	}
	from := time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 12, 23, 59, 59, 0, time.UTC)

	occurrences := ExpandSeries(series, from, to, nil)
	if len(occurrences) != 1 {
		t.Fatalf("expected 1 weekly occurrence, got %d: %v", len(occurrences), occurrences)
	}
	if occurrences[0].Format("2006-01-02") != "2026-01-12" {
		t.Fatalf("expected occurrence on 2026-01-12, got %v", occurrences[0])
	}
}

func TestExpandSeriesDailyAcrossTimezones(t *testing.T) {
	series := Series{
		ID:       2,
		StartAt:  time.Date(2026, 3, 1, 0, 0, 0, 0, time.FixedZone("CST", -6*60*60)),
		RRule:    "FREQ=DAILY",
		DateOnly: true,
	}
	from := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 3, 15, 23, 59, 59, 0, time.UTC)

	occurrences := ExpandSeries(series, from, to, nil)
	if len(occurrences) != 1 {
		t.Fatalf("expected 1 daily occurrence, got %d: %v", len(occurrences), occurrences)
	}
}

func TestAdjustToPreviousWeekday(t *testing.T) {
	saturday := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	friday := AdjustToPreviousWeekday(saturday)
	if friday.Day() != 30 || friday.Weekday() != time.Friday {
		t.Fatalf("expected Friday the 30th, got %v", friday)
	}

	sunday := time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC)
	adjusted := AdjustToPreviousWeekday(sunday)
	if adjusted.Weekday() != time.Friday || adjusted.Day() != 13 {
		t.Fatalf("expected Friday the 13th, got %v", adjusted)
	}
}

func TestWeekStartUTC(t *testing.T) {
	wednesday := time.Date(2026, 3, 11, 0, 0, 0, 0, time.UTC)
	got := WeekStartUTC(wednesday)
	want := time.Date(2026, 3, 8, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("expected week start %v, got %v", want, got)
	}
}

func TestIsWeeklyChecklistScope(t *testing.T) {
	if !IsWeeklyChecklistScope(WeeklyChecklistRule) {
		t.Fatal("expected weekly checklist rule to match scope")
	}
	if IsWeeklyChecklistScope("FREQ=DAILY") {
		t.Fatal("daily rule should not match weekly scope")
	}
}

func TestParsePeriodScope(t *testing.T) {
	week, ok := ParsePeriodScope(PeriodicChecklistRule("week"))
	if !ok || week != "week" {
		t.Fatalf("expected week scope, got %q ok=%v", week, ok)
	}
	month, ok := ParsePeriodScope(PeriodicChecklistRule("month"))
	if !ok || month != "month" {
		t.Fatalf("expected month scope, got %q ok=%v", month, ok)
	}
	year, ok := ParsePeriodScope(PeriodicChecklistRule("year"))
	if !ok || year != "year" {
		t.Fatalf("expected year scope, got %q ok=%v", year, ok)
	}
}

func TestPeriodStartUTC(t *testing.T) {
	day := time.Date(2026, 3, 11, 0, 0, 0, 0, time.UTC)
	if got := PeriodStartUTC(day, "week").Format("2006-01-02"); got != "2026-03-08" {
		t.Fatalf("expected week start 2026-03-08, got %s", got)
	}
	if got := PeriodStartUTC(day, "month").Format("2006-01-02"); got != "2026-03-01" {
		t.Fatalf("expected month start 2026-03-01, got %s", got)
	}
	if got := PeriodStartUTC(day, "year").Format("2006-01-02"); got != "2026-01-01" {
		t.Fatalf("expected year start 2026-01-01, got %s", got)
	}
}
