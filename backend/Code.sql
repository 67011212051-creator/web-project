CREATE TABLE IF NOT EXISTS riders (
  rider_id INT NOT NULL AUTO_INCREMENT,
  rider_code VARCHAR(50) NOT NULL UNIQUE,
  route_color VARCHAR(20) NOT NULL,
  max_orders SMALLINT NOT NULL DEFAULT 3,
  PRIMARY KEY (rider_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  customer_id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  PRIMARY KEY (customer_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  order_id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  qty SMALLINT NOT NULL,
  PRIMARY KEY (order_id),
  CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_sheets (
  job_id INT NOT NULL AUTO_INCREMENT,
  job_code VARCHAR(50) NOT NULL UNIQUE,
  rider_id INT NOT NULL,
  distance_km DECIMAL(10, 2) NOT NULL DEFAULT 0,
  duration_min INT NOT NULL DEFAULT 0,
  rider_pay DECIMAL(10, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id),
  CONSTRAINT job_sheets_rider_id_fkey
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_stops (
  job_id INT NOT NULL,
  order_id INT NOT NULL UNIQUE,
  stop_seq SMALLINT NOT NULL,
  distance_km DECIMAL(10, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, stop_seq),
  CONSTRAINT job_stops_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES job_sheets(job_id),
  CONSTRAINT job_stops_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB;
