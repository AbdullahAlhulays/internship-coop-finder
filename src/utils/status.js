const SECOND_IN_MS = 1000;
const MINUTE_IN_MS = 60 * SECOND_IN_MS;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const URGENT_DEADLINE_MS = 48 * HOUR_IN_MS;
const NEW_OPPORTUNITY_MS = 48 * HOUR_IN_MS;

function getLocalDate(dateValue, fallbackTime) {
  if (!dateValue) {
    return null;
  }

  const dateMatch = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!dateMatch) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const [hours = "0", minutes = "0", seconds = "0"] = fallbackTime.split(":");
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTime(time, fallbackTime) {
  if (!time) {
    return fallbackTime;
  }

  return time.length === 5 ? `${time}:00` : time;
}

function getDeadlineDate(deadline, deadlineTime) {
  return getLocalDate(deadline, normalizeTime(deadlineTime, "23:59:59"));
}

function getDisplayDate(deadline, deadlineTime) {
  return getLocalDate(deadline, normalizeTime(deadlineTime, "12:00:00"));
}

function getOpeningDate(openingDate) {
  return getLocalDate(openingDate, "00:00:00");
}

export function getApplicationStatus(deadline, now = new Date(), deadlineTime) {
  if (!deadline) {
    return {
      label: "Open",
      key: "open",
      daysLeft: null,
      hasDeadline: false,
    };
  }

  const today = new Date(now);
  const deadlineDate = getDeadlineDate(deadline, deadlineTime);

  if (!deadlineDate) {
    return {
      label: "Open",
      key: "open",
      daysLeft: null,
      hasDeadline: false,
    };
  }

  today.setHours(0, 0, 0, 0);

  const daysLeft = Math.ceil((deadlineDate - today) / DAY_IN_MS);

  if (deadlineDate - now < 0) {
    return {
      label: "Closed",
      key: "closed",
      daysLeft,
    };
  }

  return {
    label: "Open",
    key: "open",
    daysLeft,
  };
}

export function getCompanyStatus(company, now = new Date()) {
  if (company.isClosed) {
    return {
      label: "Closed",
      key: "closed",
      daysLeft: null,
    };
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const deadlineStatus = getApplicationStatus(
    company.deadline,
    now,
    company.deadlineTime,
  );

  if (deadlineStatus.key === "closed") {
    return deadlineStatus;
  }

  if (company.openingDate) {
    const openingDate = getOpeningDate(company.openingDate);

    if (!openingDate) {
      return deadlineStatus;
    }

    const daysUntilOpen = Math.ceil((openingDate - today) / DAY_IN_MS);

    if (openingDate - now > 0) {
      return {
        label: "Open Soon",
        key: "open-soon",
        daysLeft: deadlineStatus.daysLeft,
        daysUntilOpen,
      };
    }
  }

  return deadlineStatus;
}

export function getDeadlineCountdown(deadline, now = new Date(), deadlineTime) {
  const deadlineDate = getDeadlineDate(deadline, deadlineTime);

  if (!deadlineDate) {
    return null;
  }

  return getCountdownParts(deadlineDate, now);
}

export function getDeadlineSortTime(company) {
  const deadlineDate = getDeadlineDate(company.deadline, company.deadlineTime);

  return deadlineDate ? deadlineDate.getTime() : Number.POSITIVE_INFINITY;
}

export function isDeadlineUrgent(company, now = new Date()) {
  const deadlineDate = getDeadlineDate(company.deadline, company.deadlineTime);

  if (!deadlineDate) {
    return false;
  }

  const remainingMs = deadlineDate - now;

  return remainingMs > 0 && remainingMs <= URGENT_DEADLINE_MS;
}

export function isOpportunityNew(company, now = new Date()) {
  if (!company.addedAt) {
    return false;
  }

  const addedAt = new Date(company.addedAt);

  if (Number.isNaN(addedAt.getTime())) {
    return false;
  }

  const ageMs = now - addedAt;

  return ageMs >= 0 && ageMs <= NEW_OPPORTUNITY_MS;
}

export function getOpeningCountdown(openingDate, now = new Date()) {
  const openingDateValue = getOpeningDate(openingDate);

  if (!openingDateValue) {
    return null;
  }

  return getCountdownParts(openingDateValue, now);
}

export function getCountdownParts(targetDate, now = new Date()) {
  const remainingMs = Math.max(targetDate - now, 0);
  const days = Math.floor(remainingMs / DAY_IN_MS);
  const hours = Math.floor((remainingMs % DAY_IN_MS) / HOUR_IN_MS);
  const minutes = Math.floor((remainingMs % HOUR_IN_MS) / MINUTE_IN_MS);
  const seconds = Math.floor((remainingMs % MINUTE_IN_MS) / SECOND_IN_MS);

  return {
    days,
    hours,
    minutes,
    seconds,
    isOver: remainingMs === 0,
  };
}

export function formatCountdown(countdown) {
  if (!countdown) {
    return "";
  }

  const paddedHours = String(countdown.hours).padStart(2, "0");
  const paddedMinutes = String(countdown.minutes).padStart(2, "0");
  const paddedSeconds = String(countdown.seconds).padStart(2, "0");

  if (countdown.days > 0) {
    return `${countdown.days}d ${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`;
  }

  return `${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`;
}

export function formatDeadline(deadline, deadlineTime) {
  if (!deadline) {
    return "Open until filled - apply early";
  }

  const options = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };

  if (deadlineTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  const displayDate = getDisplayDate(deadline, deadlineTime);

  if (!displayDate) {
    return "Deadline not available";
  }

  return new Intl.DateTimeFormat("en", options).format(displayDate);
}
