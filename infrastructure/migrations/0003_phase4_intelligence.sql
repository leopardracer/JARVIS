CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"question" text NOT NULL,
	"cadence" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_research_id" uuid,
	"last_error" text,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"lede" text NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "inferred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "research" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_last_research_id_research_id_fk" FOREIGN KEY ("last_research_id") REFERENCES "public"."research"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_user_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_due_idx" ON "agents" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "briefings_user_period_idx" ON "briefings" USING btree ("user_id","period","period_start");--> statement-breakpoint
ALTER TABLE "research" ADD CONSTRAINT "research_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;