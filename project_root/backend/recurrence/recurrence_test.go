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
