CREATE TABLE restaurant_reactions (
  reaction_id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  restaurant_id INT NOT NULL,
  reaction_type ENUM('like', 'dislike') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reaction_id),
  UNIQUE KEY uq_restaurant_reactions_user_restaurant (user_id, restaurant_id),
  KEY idx_restaurant_reactions_restaurant (restaurant_id),
  CONSTRAINT fk_restaurant_reactions_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_restaurant_reactions_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
