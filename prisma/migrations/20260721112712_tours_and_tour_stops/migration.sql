/*
  Warnings:

  - You are about to drop the column `route_id` on the `food_logs` table. All the data in the column will be lost.
  - You are about to drop the `routes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "food_logs" DROP CONSTRAINT "food_logs_route_id_fkey";

-- DropForeignKey
ALTER TABLE "routes" DROP CONSTRAINT "routes_bakery_id_fkey";

-- DropForeignKey
ALTER TABLE "routes" DROP CONSTRAINT "routes_user_id_fkey";

-- AlterTable
ALTER TABLE "food_logs" DROP COLUMN "route_id",
ADD COLUMN     "tour_stop_id" TEXT;

-- DropTable
DROP TABLE "routes";

-- DropEnum
DROP TYPE "TransportMode";

-- CreateTable
CREATE TABLE "tours" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_steps" INTEGER,
    "total_distance_m" INTEGER,
    "total_calories_burned" INTEGER,
    "total_calories_consumed" INTEGER,
    "balance_kcal" INTEGER,

    CONSTRAINT "tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_stops" (
    "id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "bakery_id" TEXT NOT NULL,
    "distance_m" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "steps" INTEGER NOT NULL,
    "calories_burned" INTEGER NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_stops_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_stops" ADD CONSTRAINT "tour_stops_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_stops" ADD CONSTRAINT "tour_stops_bakery_id_fkey" FOREIGN KEY ("bakery_id") REFERENCES "bakeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_tour_stop_id_fkey" FOREIGN KEY ("tour_stop_id") REFERENCES "tour_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
