"use server";

import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import "./../app/app.css";
import { Amplify } from "aws-amplify";
import outputs from "./../amplify_outputs.json";
import "@aws-amplify/ui-react/styles.css";
import "dotenv/config";
import { google } from "googleapis";
import {
  addDiscoveredEvents,
  addDurationsToCalendarEvents,
  calculateEndDate,
  getEventsForDay,
  getMinutes,
  insertEvent,
} from "./calendar/helpers";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { fixedHabits, flexibleWorkHabits } from "./habits";
import { unionBy } from "lodash";

Amplify.configure(outputs);

const client = generateClient<Schema>();

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URL
);

const calendar = google.calendar({
  version: "v3",
  auth: oAuth2Client,
});

const api = new TodoistApi(process.env.TODOIST_API_KEY as string);

oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
});

interface AppProps {
  searchParams: { [key: string]: any };
}

export default async function App({ searchParams }: AppProps) {
  if (searchParams?.code) {
    oAuth2Client.getToken(searchParams?.code, (err, tokens) => {
      console.log("tokens", tokens);
    });
  }

  const authorizationUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    include_granted_scopes: true,
  });

  console.log("auth", authorizationUrl);

  const tasks = await api.getTasks({
    filter: "@this_week",
  });

  const formattedTasks = tasks.map((t) => {
    const [title, duration] = t.content.split(" | ");
    return {
      title,
      duration: Number(duration),
      colorId: "6",
    };
  });

  // await calendar.events
  //   .list({
  //     calendarId: process.env.GOOGLE_CALENDAR_ID,
  //     privateExtendedProperty: "source=todoist",
  //   })
  //   .then((events) => console.log("events", events.data?.items));
  // for (var j = 0; j < tasks.length; j++) {
  //   const meetingStart = new Date();
  //   meetingStart.setHours(8, 0, 0, 0);
  //   const meetingEnd = new Date();
  //   meetingEnd.setHours(8, 30, 0, 0);
  //   insertEvent({
  //     title: tasks[j].content,
  //     startTime: meetingStart,
  //     endTime: meetingEnd,
  //     colorId: "3",
  //     extendedProperties: { taskId: tasks[j].id, source: "todoist" },
  //   });
  // }

  // await api.updateTask("7439128804", {
  //   duration: 15,
  //   durationUnit: "minute",
  // });

  for (var x = 1; x <= 1; x++) {
    const {
      timeBlockingEvents: timeBlockingEvents1,
      tasks,
      isDayOff,
    } = await getEventsForDay(calendar, x);

    const timeBlockingEvents = timeBlockingEvents1?.filter(
      (t) => t.title !== "Day off"
    );

    const fixedTimeEvents = unionBy(
      timeBlockingEvents,
      fixedHabits,
      "title"
    ).sort((a, b) => {
      if (!a.startTime || !b.startTime) {
        return -1;
      }
      return (
        60 * a.startTime[0] +
        a.startTime[1] -
        (60 * b.startTime[0] + b.startTime[1])
      );
    });

    const flexibleEvents1 = !isDayOff
      ? unionBy(flexibleWorkHabits, tasks, "title")
      : tasks;
    const fixedTitles = fixedTimeEvents.map((e) => e.title);
    const flexibleEvents = flexibleEvents1.filter(
      (e) => !fixedTitles.includes(e.title)
    );

    const allEvents = [] as {
      title: string;
      duration: number;
      colorId: string;
      startTime: number[];
      endTime: number[];
    }[];

    let nextTimeEventStartTime = [] as number[];

    const currTime = new Date();
    currTime.setMinutes(Math.round(currTime.getMinutes() / 15) * 15, 0, 0);
    const workTime = new Date();
    workTime.setHours(10, 0, 0, 0);

    let date =
      x == 0
        ? currTime > workTime
          ? [currTime.getHours(), currTime.getMinutes()]
          : [10, 0]
        : [10, 0];

    while (fixedTimeEvents.length || flexibleEvents.length) {
      while (fixedTimeEvents.length) {
        const fixedTimeEvent = fixedTimeEvents.shift();

        if (!!fixedTimeEvent) {
          allEvents.push(fixedTimeEvent);
          date =
            getMinutes(date) > getMinutes(fixedTimeEvent.endTime)
              ? date
              : fixedTimeEvent.endTime;
        }

        if (fixedTimeEvents.length && fixedTimeEvents[0].startTime) {
          nextTimeEventStartTime = fixedTimeEvents[0].startTime;
        }

        if (
          !flexibleEvents.length ||
          getMinutes(nextTimeEventStartTime) -
            getMinutes(allEvents[allEvents.length - 1].endTime) >=
            flexibleEvents[0].duration
        ) {
          break;
        }
      }

      while (flexibleEvents.length) {
        const flexibleEvent = flexibleEvents.shift();

        if (!!flexibleEvent) {
          const endTime = calculateEndDate(date, flexibleEvent.duration);
          allEvents.push({
            ...flexibleEvent,
            startTime: date,
            endTime,
          });
          date = endTime;
        }

        if (
          !flexibleEvents.length ||
          getMinutes(nextTimeEventStartTime) -
            getMinutes(allEvents[allEvents.length - 1].endTime) <
            flexibleEvents[0].duration
        ) {
          break;
        }
      }
    }
    console.log("all", allEvents);

    for (const e of allEvents) {
      const meetingTitle = e.title;
      const colorId = e.colorId;
      const meetingStart = new Date();

      meetingStart.setDate(meetingStart.getDate() + x);
      meetingStart.setHours(e.startTime[0], e.startTime[1], 0, 0);
      const meetingEnd = new Date();
      meetingEnd.setDate(meetingEnd.getDate() + x);
      meetingEnd.setHours(e.endTime[0], e.endTime[1], 0, 0);
      const hasEvent = timeBlockingEvents
        ?.map((i) => i.title)
        .includes(e.title);
      if (hasEvent) {
        const calendarEvent = timeBlockingEvents?.find(
          (t) => t.title === e.title
        );
        const id = calendarEvent?.id;

        if (id) {
          const resp = await calendar.events.patch({
            calendarId: process.env.GOOGLE_CALENDAR_ID,
            eventId: id,
            requestBody: {
              start: {
                dateTime: meetingStart,
              },
              end: {
                dateTime: meetingEnd,
              },
            },
          });
        }
      } else {
        insertEvent(calendar, {
          title: meetingTitle,
          startTime: meetingStart,
          endTime: meetingEnd,
          colorId,
        });
      }
    }
  }
}
