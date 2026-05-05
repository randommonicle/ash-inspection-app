-- Add meter_reads to the section_key enum.
-- Placed after plant_room in the logical walkthrough order.
ALTER TYPE section_key ADD VALUE IF NOT EXISTS 'meter_reads' AFTER 'plant_room';
