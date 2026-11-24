# @keel/sdk

```ts
import { Keel } from "@keel/sdk";

const keel = new Keel({ apiKey: process.env.KEEL_API_KEY!, baseUrl: "https://api.keel.run" });

const run = await keel.runs.create("agt_...", { task: "Rebalance FED-DEC" });
for await (const event of keel.runs.stream(run.id)) {
  console.log(event.seq, event.type);
}

// a run paused for approval
await keel.runs.approve(run.id, "tc_...");
```

`stream` reconnects from the last event it saw, so a dropped connection never skips or repeats events. It ends on a terminal event, or when the run pauses for a person.

The python client has the same shape: `from keel.client import Keel`.
