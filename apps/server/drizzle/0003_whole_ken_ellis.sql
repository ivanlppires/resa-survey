ALTER TABLE "questions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "group_key" varchar(50);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "group_text" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "subsection" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "max_selections" integer;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "questionnaire_version" integer DEFAULT 1 NOT NULL;