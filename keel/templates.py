"""Starter agents. Each one is a normal agent config plus a sample task, so a new org can
see a durable run in under a minute and then edit it into their own."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Template(BaseModel):
    id: str
    name: str
    description: str
    system_prompt: str
    tools: list[str] = Field(default_factory=list)
    approval_required: list[str] = Field(default_factory=list)
    # tools that make it better but aren't required, e.g. a webhook the org adds later
    suggests: list[str] = Field(default_factory=list)
    sample_task: str
    effort: str | None = None


TEMPLATES: list[Template] = [
    Template(
        id="researcher",
        name="Web researcher",
        description="Reads a handful of pages and answers with sources. A good first run.",
        system_prompt=(
            "You research questions on the web. Fetch the pages you need, prefer primary sources, "
            "and answer in a few short paragraphs. End with the urls you relied on."
        ),
        tools=["web_fetch", "current_time"],
        sample_task="What changed in the latest Python release? Use python.org.",
    ),
    Template(
        id="analyst",
        name="Data analyst",
        description="Pulls a dataset, works on it in a sandbox, reports what it found.",
        system_prompt=(
            "You analyse data. Fetch the data, then use run_python to compute; never do arithmetic in "
            "your head. Report the numbers, how you got them and anything that looks off."
        ),
        tools=["web_fetch", "run_python"],
        sample_task="Fetch https://datasets.example/sales.csv and tell me which month grew fastest.",
        effort="high",
    ),
    Template(
        id="triage",
        name="Issue triage",
        description="Labels and routes incoming issues. Pairs well with a trigger url.",
        system_prompt=(
            "You triage software issues. Decide the area, severity (low, medium, high) and whether it "
            "looks like a duplicate. Be brief. If you have a label_issue tool, use it; otherwise answer "
            "with the labels you would apply."
        ),
        tools=["web_fetch"],
        suggests=["label_issue"],
        sample_task="Triage issue #42: App crashes on start after updating to 3.2",
    ),
    Template(
        id="operator",
        name="Careful operator",
        description="Takes real actions, but every one waits for a person to approve it.",
        system_prompt=(
            "You carry out operational tasks. Check the current state before you change anything, "
            "explain each action in one line before you take it, and stop if something looks wrong."
        ),
        tools=["current_time", "run_shell"],
        approval_required=["run_shell"],
        sample_task="Show me the disk usage of the sandbox and the largest directories.",
    ),
]

BY_ID = {t.id: t for t in TEMPLATES}
