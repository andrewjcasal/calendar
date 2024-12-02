import { calendar_v3 } from "googleapis";
import { TodoistApi } from "@doist/todoist-api-typescript";

const api = new TodoistApi(process.env.TODOIST_API_KEY as string);

export const getEventsForDay = async (calendar: calendar_v3.Calendar, dayOffset: number) => {

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + dayOffset);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + dayOffset);
  endDate.setHours(23, 59, 59, 59);

  // Look for existing events in Time Blocking
  const timeBlockingEvents = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
  });

  const workEvents = await calendar.events.list({
    calendarId: process.env.GOOGLE_WORK_CALENDAR_ID,
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
});

  const tasks = await api.getTasks({
    filter: `p1 | ${startDate.getMonth() + 1}/${startDate.getDate()}`,
  });

  return {
      timeBlockingEvents: addDurationsToCalendarEvents(timeBlockingEvents.data.items),
      workEvents: addDurationsToCalendarEvents(workEvents.data.items, "meeting"),
      tasks: tasks.map(t => ({
        title: t.content,
        duration: 30,
        colorId: "6",
        source: "todoist"
      })),
      isDayOff: timeBlockingEvents.data.items?.find(t => t.summary === "Day off")
  }
}

export const addDiscoveredEvents = async (elem: calendar_v3.Schema$Event | undefined) => {

    if (!!elem) {
      const elemStartTime = elem.start?.dateTime;
      const elemEndTime = elem.end?.dateTime;

      if (elemStartTime && elemEndTime) {
        const startDateTime = new Date(elemStartTime);
        const endDateTime = new Date(elemEndTime);
        const ttStartTime = new Date(startDateTime);
        ttStartTime.setMinutes(ttStartTime.getMinutes() - 30);
        const prepareMealStartTime = new Date(startDateTime);
        prepareMealStartTime.setMinutes(prepareMealStartTime.getMinutes() - 30);
        return [
          {
            title: "TT",
            startDate: [ttStartTime.getHours(), ttStartTime.getMinutes()],
            endDate: [startDateTime.getHours(), startDateTime.getMinutes()],
            colorId: "1"
          },
          {
            title: "Prepare meal",
            startDate: [
              prepareMealStartTime.getHours(),
              prepareMealStartTime.getMinutes(),
            ],
            endDate: [ttStartTime.getHours(), ttStartTime.getMinutes()],
            colorId: "2"
          }
        ];
      }
    }

    return [];
}

type InsertEventProps = {
  title: string;
  startTime: Date;
  endTime: Date;
  colorId: string;
  extendedProperties?: { [key: string]: any };
};

export const insertEvent = (calendar: calendar_v3.Calendar,{
  title,
  startTime,
  endTime,
  colorId,
  extendedProperties,
}: InsertEventProps) => {
  calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: title,
      start: {
        dateTime: startTime,
      },
      end: {
        dateTime: endTime,
      },
      colorId,
      extendedProperties,
    },
  });
};

export const calculateEndDate = (date: number[], duration: number) => {
  let hr = date[0];
  let min = date[1] + duration;

  if (min >= 60) {
    hr = hr+1;
    min = min-60;
  }

  return [hr, min]
}

export const addDurationsToCalendarEvents = (events: calendar_v3.Schema$Event[] | undefined, source?: string) => 
  (events || []).map((i) => {
    const endTime = !!i.end?.dateTime ? new Date(i.end?.dateTime) : null
    const startTime = !!i.start?.dateTime ? new Date(i.start?.dateTime) : null;
    let duration = null;

    if (!startTime || !endTime) {
      return null;
    }
    const durationMs = endTime - startTime;
    duration = durationMs / 60000;
    return {
      id: i.id,
      title: !!i.summary ? i.summary : '',
      startTime: [startTime.getHours(), startTime.getMinutes()],
      endTime:  [endTime.getHours(), endTime.getMinutes()],
      duration,
      colorId: i.colorId || "5",
      source: source || i.extendedProperties?.private?.source,
    };
  }).filter(t => t !== null);

export const getMinutes = (date: number[]) => {
  return 60 * date[0] + date[1];
}