-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('walk', 'bike', 'bus');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "activity_level" TEXT NOT NULL,
    "daily_goal_calories" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bakeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "opening_hours" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bakeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bread_items" (
    "id" TEXT NOT NULL,
    "bakery_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" INTEGER NOT NULL,
    "calories" INTEGER NOT NULL,
    "base_weight_g" INTEGER,
    "carb_g" DOUBLE PRECISION,
    "protein_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "source_grade" TEXT,
    "source_note" TEXT,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bread_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tourist_spots" (
    "content_id" TEXT NOT NULL,
    "content_type_id" TEXT,
    "title" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "overview" TEXT,
    "opening_hours" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tourist_spots_pkey" PRIMARY KEY ("content_id")
);

-- CreateTable
CREATE TABLE "spot_images" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "origin_url" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "spot_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bakery_id" TEXT NOT NULL,
    "transport_mode" "TransportMode" NOT NULL,
    "distance" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "fixed_met_value" DOUBLE PRECISION NOT NULL,
    "calories_burned" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bread_item_id" TEXT NOT NULL,
    "route_id" TEXT,
    "calories" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "photo_url" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bread_items_bakery_id_name_key" ON "bread_items"("bakery_id", "name");

-- AddCheckConstraint (richer menu 데이터 품질 규칙 — bbangkal_erd_v3.md 참고)
ALTER TABLE "bread_items" ADD CONSTRAINT "bread_items_calories_check" CHECK ("calories" BETWEEN 0 AND 5000);
ALTER TABLE "bread_items" ADD CONSTRAINT "bread_items_source_grade_check" CHECK ("source_grade" IS NULL OR "source_grade" IN ('A', 'B', 'C'));
ALTER TABLE "bread_items" ADD CONSTRAINT "bread_items_source_note_required_for_c_check" CHECK ("source_grade" <> 'C' OR "source_note" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "spot_images_content_id_seq_key" ON "spot_images"("content_id", "seq");

-- AddForeignKey
ALTER TABLE "bread_items" ADD CONSTRAINT "bread_items_bakery_id_fkey" FOREIGN KEY ("bakery_id") REFERENCES "bakeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_images" ADD CONSTRAINT "spot_images_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "tourist_spots"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_bakery_id_fkey" FOREIGN KEY ("bakery_id") REFERENCES "bakeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_bread_item_id_fkey" FOREIGN KEY ("bread_item_id") REFERENCES "bread_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
