const SECOND_IN_MS = 1000;
const MINUTE_IN_MS = 60 * SECOND_IN_MS;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

function getDeadlineDate(deadline, deadlineTime) {
  if (!deadline) {
    return null;
  }

  const time = deadlineTime
    ? deadlineTime.length === 5
      ? `${deadlineTime}:00`
      : deadlineTime
    : "23:59:59";

  return new Date(`${deadline}T${time}`);
}

function getOpeningDate(openingDate) {
  return new Date(`${openingDate}T00:00:00`);
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

export function getOpeningCountdown(openingDate, now = new Date()) {
  return getCountdownParts(getOpeningDate(openingDate), now);
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
    return "Open until filled";
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

  const time = deadlineTime ? `${deadlineTime}:00` : "12:00:00";

  return new Intl.DateTimeFormat("en", options).format(
    new Date(`${deadline}T${time}`),
  );
}
