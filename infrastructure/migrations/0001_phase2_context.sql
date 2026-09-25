ALTER TABLE "insights" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "research" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "research" ADD COLUMN "model" text;--> statement-breakpoint
CREATE UNIQUE INDEX "insights_user_fingerprint_idx" ON "insights" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_provider_external_idx" ON "portfolios" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_portfolio_external_idx" ON "transactions" USING btree ("portfolio_id","external_id");