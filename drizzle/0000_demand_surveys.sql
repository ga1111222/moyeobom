CREATE TABLE demand_signals (
 id TEXT PRIMARY KEY,
 school_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 topic TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('search','wish')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(school_id, actor_id, topic, kind)
);
--> statement-breakpoint
CREATE INDEX demand_school_time ON demand_signals(school_id, updated_at);
--> statement-breakpoint
CREATE TABLE planning_surveys (
 id TEXT PRIMARY KEY,
 school_id TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 topic TEXT NOT NULL,
 options_json TEXT NOT NULL,
 closes_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX survey_school_status ON planning_surveys(school_id, status);
--> statement-breakpoint
CREATE TABLE survey_responses (
 survey_id TEXT NOT NULL REFERENCES planning_surveys(id),
 actor_id TEXT NOT NULL,
 choice INTEGER NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(survey_id, actor_id)
);
