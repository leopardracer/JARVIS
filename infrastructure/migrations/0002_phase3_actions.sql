ALTER TABLE "action_approvals" ADD COLUMN "phrase" text;--> statement-breakpoint
ALTER TABLE "action_approvals" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "action_approvals" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "insight_id" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "execution_result" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "executed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "broker_connections" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "broker_connections" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "broker_connections" ADD COLUMN "portfolio_id" uuid;--> statement-breakpoint
ALTER TABLE "broker_connections" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "broker_connections" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_connection_id_broker_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."broker_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_connections" ADD CONSTRAINT "broker_connections_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_approvals_action_idx" ON "action_approvals" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "broker_connections_user_idx" ON "broker_connections" USING btree ("user_id");