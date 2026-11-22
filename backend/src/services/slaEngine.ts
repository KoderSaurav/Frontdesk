import { Holiday, Ticket, TicketPriority } from '../types';

export const WORKING_HOURS = {
  START_HOUR: 9,
  START_MINUTE: 30, // 09:30 AM
  END_HOUR: 18,
  END_MINUTE: 30,   // 06:30 PM
  TOTAL_MINUTES_PER_DAY: 9 * 60, // 540 minutes (9 hours)
};

export const SLA_QUOTAS = {
  URGENT: {
    firstResponseMinutes: 2 * 60, // 120 minutes (2 working hours)
    resolutionWorkingDays: 1,      // Same working day (until 18:30 of current/next working day)
    resolutionMinutes: 9 * 60,     // Max 540 working minutes
  },
  MEDIUM: {
    firstResponseMinutes: 4.5 * 60, // 270 minutes (4.5 working hours / half working day)
    resolutionWorkingDays: 3,       // 3 working days
    resolutionMinutes: 3 * 9 * 60,  // 1620 working minutes
  },
  LOW: {
    firstResponseMinutes: 9 * 60,   // 540 minutes (1 working day)
    resolutionWorkingDays: 5,       // 1 working week (5 working days)
    resolutionMinutes: 5 * 9 * 60,  // 2700 working minutes
  },
};

export const AUTO_CLOSE_WORKING_MINUTES = 5 * 9 * 60; // 1 working week = 2700 working minutes
export const REOPEN_MAX_DAYS = 7; // 7 calendar days after resolution

/**
 * Returns YYYY-MM-DD string in local time, avoiding UTC off-by-one shifts.
 */
export function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Checks if a given date is a working day (Mon-Fri) and not a festival holiday.
 */
export function isWorkingDay(date: Date, holidays: Holiday[] = []): boolean {
  const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  const dateStr = getLocalDateString(date);
  const isHoliday = holidays.some((h) => h.date === dateStr);
  return !isHoliday;
}

/**
 * Normalizes a date into working hours.
 * If date is before 9:30 AM on a working day, moves to 9:30 AM today.
 * If date is after 6:30 PM or on a weekend/holiday, advances to 9:30 AM of the next working day.
 */
export function getNextWorkingTime(date: Date, holidays: Holiday[] = []): Date {
  let curr = new Date(date);

  while (true) {
    if (!isWorkingDay(curr, holidays)) {
      // Advance to next day at 9:30 AM
      curr.setDate(curr.getDate() + 1);
      curr.setHours(WORKING_HOURS.START_HOUR, WORKING_HOURS.START_MINUTE, 0, 0);
      continue;
    }

    const startToday = new Date(curr);
    startToday.setHours(WORKING_HOURS.START_HOUR, WORKING_HOURS.START_MINUTE, 0, 0);

    const endToday = new Date(curr);
    endToday.setHours(WORKING_HOURS.END_HOUR, WORKING_HOURS.END_MINUTE, 0, 0);

    if (curr < startToday) {
      return startToday;
    }

    if (curr >= endToday) {
      // Passed end of working day, advance to 9:30 AM next day
      curr.setDate(curr.getDate() + 1);
      curr.setHours(WORKING_HOURS.START_HOUR, WORKING_HOURS.START_MINUTE, 0, 0);
      continue;
    }

    // Inside working hours
    return curr;
  }
}

/**
 * Adds an exact number of WORKING MINUTES to a starting date, respecting:
 * - 9:30 AM to 6:30 PM working hours
 * - Weekends
 * - Festival holidays
 */
export function addWorkingMinutes(
  startDate: Date,
  minutesToAdd: number,
  holidays: Holiday[] = []
): Date {
  if (minutesToAdd <= 0) return new Date(startDate);

  let current = getNextWorkingTime(startDate, holidays);
  let remainingMinutes = minutesToAdd;

  while (remainingMinutes > 0) {
    const endToday = new Date(current);
    endToday.setHours(WORKING_HOURS.END_HOUR, WORKING_HOURS.END_MINUTE, 0, 0);

    const availableMinutesToday = Math.floor((endToday.getTime() - current.getTime()) / (60 * 1000));

    if (remainingMinutes <= availableMinutesToday) {
      return new Date(current.getTime() + remainingMinutes * 60 * 1000);
    }

    remainingMinutes -= availableMinutesToday;
    // Advance to 9:30 AM of next day and loop (getNextWorkingTime handles weekends/holidays)
    const nextDay = new Date(current);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(WORKING_HOURS.START_HOUR, WORKING_HOURS.START_MINUTE, 0, 0);
    current = getNextWorkingTime(nextDay, holidays);
  }

  return current;
}

/**
 * Calculates the exact working minutes elapsed between two dates.
 * Paused minutes are subtracted.
 */
export function getElapsedWorkingMinutes(
  startDate: Date,
  endDate: Date,
  holidays: Holiday[] = [],
  pausedMinutes: number = 0
): number {
  if (endDate <= startDate) return 0;

  let current = new Date(startDate);
  let totalMinutes = 0;

  while (current < endDate) {
    if (isWorkingDay(current, holidays)) {
      const startToday = new Date(current);
      startToday.setHours(WORKING_HOURS.START_HOUR, WORKING_HOURS.START_MINUTE, 0, 0);

      const endToday = new Date(current);
      endToday.setHours(WORKING_HOURS.END_HOUR, WORKING_HOURS.END_MINUTE, 0, 0);

      const effectiveStart = current < startToday ? startToday : current;
      const effectiveEnd = endDate < endToday ? endDate : endToday;

      if (effectiveStart < effectiveEnd && effectiveEnd > startToday && effectiveStart < endToday) {
        const diff = Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (60 * 1000));
        if (diff > 0) {
          totalMinutes += diff;
        }
      }
    }

    // Advance to next day at 9:30 AM
    current.setDate(current.getDate() + 1);
    current.setHours(WORKING_HOURS.START_HOUR, WORKING_HOURS.START_MINUTE, 0, 0);
  }

  const netMinutes = Math.max(0, totalMinutes - pausedMinutes);
  return netMinutes;
}

/**
 * Computes initial SLA deadlines for a newly created ticket.
 * Handles Urgent "Same working day" resolution rule.
 */
export function calculateInitialDeadlines(
  createdAt: Date,
  priority: TicketPriority,
  holidays: Holiday[] = []
): { responseDeadline: Date; resolutionDeadline: Date } {
  const normCreated = getNextWorkingTime(createdAt, holidays);
  const quota = SLA_QUOTAS[priority];

  // 1. Response deadline
  const responseDeadline = addWorkingMinutes(normCreated, quota.firstResponseMinutes, holidays);

  // 2. Resolution deadline
  let resolutionDeadline: Date;
  if (priority === 'URGENT') {
    // "Fix it the same working day" -> 6:30 PM of the current working day
    const sameDayClose = new Date(normCreated);
    sameDayClose.setHours(WORKING_HOURS.END_HOUR, WORKING_HOURS.END_MINUTE, 0, 0);
    resolutionDeadline = sameDayClose;
  } else if (priority === 'MEDIUM') {
    // ~3 working days: add 3 days worth of working hours (3 * 9 = 27 hours)
    resolutionDeadline = addWorkingMinutes(normCreated, quota.resolutionMinutes, holidays);
  } else {
    // LOW: ~1 working week (5 working days = 45 working hours)
    resolutionDeadline = addWorkingMinutes(normCreated, quota.resolutionMinutes, holidays);
  }

  return { responseDeadline, resolutionDeadline };
}

/**
 * Recalculates deadlines when ticket priority is changed after creation.
 * Consumed working time is retained and deducted from the new priority quota.
 */
export function recalculateDeadlinesOnPriorityChange(
  ticket: Ticket,
  newPriority: TicketPriority,
  holidays: Holiday[] = [],
  now: Date = new Date()
): { responseDeadline: Date; resolutionDeadline: Date; isResponseOverdue: boolean; isResolutionOverdue: boolean } {
  const createdAt = new Date(ticket.created_at);
  const elapsedWorkingMinutes = getElapsedWorkingMinutes(
    createdAt,
    now,
    holidays,
    ticket.total_paused_working_minutes || 0
  );

  const newQuota = SLA_QUOTAS[newPriority];

  // Response SLA recalculation (only relevant if ticket has not yet received first response)
  let responseDeadline: Date;
  let isResponseOverdue = false;

  if (ticket.first_response_at) {
    // Already responded, keep original response deadline
    responseDeadline = new Date(ticket.response_deadline);
  } else {
    const remainingResponseMinutes = newQuota.firstResponseMinutes - elapsedWorkingMinutes;
    if (remainingResponseMinutes <= 0) {
      isResponseOverdue = true;
      // Overdue right now
      responseDeadline = new Date(now.getTime() - 1000);
    } else {
      responseDeadline = addWorkingMinutes(now, remainingResponseMinutes, holidays);
    }
  }

  // Resolution SLA recalculation
  let resolutionDeadline: Date;
  let isResolutionOverdue = false;

  if (ticket.resolved_at) {
    resolutionDeadline = new Date(ticket.resolution_deadline);
  } else {
    let targetResolutionQuotaMinutes = newQuota.resolutionMinutes;
    if (newPriority === 'URGENT') {
      // Urgent resolution is same working day (until 6:30 PM today)
      const todayEnd = new Date(now);
      todayEnd.setHours(WORKING_HOURS.END_HOUR, WORKING_HOURS.END_MINUTE, 0, 0);
      if (now >= todayEnd || !isWorkingDay(now, holidays)) {
        // Passed today or on holiday: next working day close
        const nextWork = getNextWorkingTime(now, holidays);
        nextWork.setHours(WORKING_HOURS.END_HOUR, WORKING_HOURS.END_MINUTE, 0, 0);
        resolutionDeadline = nextWork;
      } else {
        resolutionDeadline = todayEnd;
      }
    } else {
      const remainingResolutionMinutes = targetResolutionQuotaMinutes - elapsedWorkingMinutes;
      if (remainingResolutionMinutes <= 0) {
        isResolutionOverdue = true;
        resolutionDeadline = new Date(now.getTime() - 1000);
      } else {
        resolutionDeadline = addWorkingMinutes(now, remainingResolutionMinutes, holidays);
      }
    }
  }

  return {
    responseDeadline,
    resolutionDeadline,
    isResponseOverdue,
    isResolutionOverdue,
  };
}

/**
 * Formats remaining minutes into human-readable representation:
 * e.g., "1h 45m left", "3d 2h left", "Overdue by 25m"
 */
export function formatDuration(minutes: number, isOverdue: boolean): string {
  const absMin = Math.abs(minutes);
  const days = Math.floor(absMin / (9 * 60)); // in 9-hour working days
  const hours = Math.floor((absMin % (9 * 60)) / 60);
  const mins = absMin % 60;

  let str = '';
  if (days > 0) str += `${days}d `;
  if (hours > 0 || days > 0) str += `${hours}h `;
  str += `${mins}m`;

  return isOverdue ? `Overdue by ${str}` : `${str} remaining`;
}

/**
 * Computes dynamic SLA status for a ticket at current point in time.
 */
export function computeTicketSlaStatus(
  ticket: Ticket,
  holidays: Holiday[] = [],
  now: Date = new Date()
) {
  const isPaused = ticket.status === 'WAITING_FOR_CUSTOMER';

  // Effective current evaluation time
  const evalTime = isPaused && ticket.sla_paused_at ? new Date(ticket.sla_paused_at) : now;

  // Response SLA status
  let isResponseOverdue = false;
  let responseRemainingMinutes = 0;
  if (!ticket.first_response_at) {
    const deadline = new Date(ticket.response_deadline);
    if (evalTime > deadline) {
      isResponseOverdue = true;
      responseRemainingMinutes = -getElapsedWorkingMinutes(deadline, evalTime, holidays);
    } else {
      responseRemainingMinutes = getElapsedWorkingMinutes(evalTime, deadline, holidays);
    }
  }

  // Resolution SLA status
  let isResolutionOverdue = false;
  let resolutionRemainingMinutes = 0;
  if (!ticket.resolved_at && ticket.status !== 'CLOSED') {
    const deadline = new Date(ticket.resolution_deadline);
    if (evalTime > deadline) {
      isResolutionOverdue = true;
      resolutionRemainingMinutes = -getElapsedWorkingMinutes(deadline, evalTime, holidays);
    } else {
      resolutionRemainingMinutes = getElapsedWorkingMinutes(evalTime, deadline, holidays);
    }
  }

  const wasResponseBreached = ticket.first_response_at
    ? new Date(ticket.first_response_at) > new Date(ticket.response_deadline)
    : isResponseOverdue;

  const wasResolutionBreached = ticket.resolved_at
    ? new Date(ticket.resolved_at) > new Date(ticket.resolution_deadline)
    : isResolutionOverdue;

  return {
    is_response_overdue: isResponseOverdue,
    is_resolution_overdue: isResolutionOverdue,
    was_response_sla_breached: wasResponseBreached,
    was_resolution_sla_breached: wasResolutionBreached,
    response_remaining_minutes: responseRemainingMinutes,
    resolution_remaining_minutes: resolutionRemainingMinutes,
    response_remaining_formatted: !ticket.first_response_at
      ? formatDuration(responseRemainingMinutes, isResponseOverdue)
      : wasResponseBreached
      ? 'Responded (Breached)'
      : 'Responded (Met)',
    resolution_remaining_formatted: !ticket.resolved_at && ticket.status !== 'CLOSED'
      ? formatDuration(resolutionRemainingMinutes, isResolutionOverdue)
      : wasResolutionBreached
      ? 'Resolved (Breached)'
      : 'Resolved (Met)',
    is_paused: isPaused,
  };
}

/**
 * Checks if a ticket in WAITING_FOR_CUSTOMER has exceeded 1 working week (45 working hours).
 * If true, eligible for automatic closure.
 */
export function isAutoCloseEligible(
  ticket: Ticket,
  holidays: Holiday[] = [],
  now: Date = new Date()
): boolean {
  if (ticket.status !== 'WAITING_FOR_CUSTOMER' || !ticket.sla_paused_at) {
    return false;
  }
  const pausedDate = new Date(ticket.sla_paused_at);
  const elapsedWhileWaiting = getElapsedWorkingMinutes(pausedDate, now, holidays);
  return elapsedWhileWaiting >= AUTO_CLOSE_WORKING_MINUTES;
}

/**
 * Checks if a resolved ticket can be reopened by the customer.
 * Permitted only within 7 calendar days after resolution.
 */
export function isReopenEligible(ticket: Ticket, now: Date = new Date()): { eligible: boolean; reason?: string } {
  if (ticket.status !== 'RESOLVED' || !ticket.resolved_at) {
    return { eligible: false, reason: 'Ticket is not in resolved status.' };
  }
  const resolvedDate = new Date(ticket.resolved_at);
  const diffDays = (now.getTime() - resolvedDate.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays > REOPEN_MAX_DAYS) {
    return {
      eligible: false,
      reason: `Reopening window expired. The ticket was resolved ${Math.floor(diffDays)} days ago (limit is 7 days). Please create a new ticket.`,
    };
  }

  return { eligible: true };
}
