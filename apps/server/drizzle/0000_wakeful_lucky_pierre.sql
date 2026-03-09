CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'multiple_choice', 'yes_no', 'scale', 'text');--> statement-breakpoint
CREATE TYPE "public"."survey_section" AS ENUM('socioeconomic', 'behavioral', 'environmental');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('draft', 'in_progress', 'completed', 'synced');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'interviewer', 'viewer');--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"number" integer NOT NULL,
	"text" text NOT NULL,
	"type" "question_type" NOT NULL,
	"section" "survey_section" NOT NULL,
	"options" jsonb,
	"scale_min" integer,
	"scale_max" integer,
	"conditional" jsonb,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"question_key" varchar(50) NOT NULL,
	"value" jsonb NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"municipality" text NOT NULL,
	"biome" text NOT NULL,
	"geojson" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"interviewer_id" integer NOT NULL,
	"lot_number" text,
	"gps_lat" double precision,
	"gps_lng" double precision,
	"status" "survey_status" DEFAULT 'draft' NOT NULL,
	"device_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"device_info" text,
	"payload_hash" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'interviewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;