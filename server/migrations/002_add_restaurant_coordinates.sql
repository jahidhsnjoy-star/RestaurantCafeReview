ALTER TABLE restaurants
  ADD COLUMN latitude DECIMAL(10, 7) NULL AFTER location,
  ADD COLUMN longitude DECIMAL(10, 7) NULL AFTER latitude;

UPDATE restaurants
SET latitude = 22.3592964, longitude = 91.8218643
WHERE restaurant_id = 1 AND name = 'Cafe Aroma';

UPDATE restaurants
SET latitude = 22.3662210, longitude = 91.8231299
WHERE restaurant_id = 2 AND name = 'Burger Point';

UPDATE restaurants
SET latitude = 22.3621090, longitude = 91.8076034
WHERE restaurant_id = 3 AND name = 'Pizza Corner';

UPDATE restaurants
SET latitude = 22.4017730, longitude = 91.8509226
WHERE restaurant_id = 4 AND name = 'Food Village';

UPDATE restaurants
SET latitude = 22.3624040, longitude = 91.8241685
WHERE restaurant_id = 5 AND name = 'Sweet Treats';