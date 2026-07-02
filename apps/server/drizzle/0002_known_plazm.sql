ALTER TABLE "responses" ADD COLUMN "text_value" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_client_id_unique" UNIQUE("client_id");