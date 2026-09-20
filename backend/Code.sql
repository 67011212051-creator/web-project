DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ไรเดอร์: แค่รหัส + สีเส้นทาง + โควต้าออเดอร์
CREATE TABLE riders (
  rider_id    SERIAL PRIMARY KEY,
  rider_code  VARCHAR(10) NOT NULL UNIQUE,
  route_color VARCHAR(7)  NOT NULL,
  max_orders  SMALLINT    NOT NULL DEFAULT 3
);

-- ลูกค้า: ป้ายชื่อจุดส่ง + พิกัด
CREATE TABLE customers (
  customer_id SERIAL PRIMARY KEY,
  label       VARCHAR(50)   NOT NULL,
  latitude    NUMERIC(10,7) NOT NULL,
  longitude   NUMERIC(10,7) NOT NULL
);

-- เมนู
CREATE TABLE menu_items (
  item_id    SERIAL PRIMARY KEY,
  item_name  VARCHAR(80)  NOT NULL,
  cost_price NUMERIC(8,2) NOT NULL,
  sell_price NUMERIC(8,2) NOT NULL
);

-- รอบส่ง: 1 วัน 1 รอบ
CREATE TABLE rounds (
  round_id   SERIAL PRIMARY KEY,
  round_date DATE NOT NULL UNIQUE,
  status     VARCHAR(12) NOT NULL DEFAULT 'planning'
             CHECK (status IN ('planning','dispatched','completed'))
);

-- ออเดอร์
CREATE TABLE orders (
  order_id     SERIAL PRIMARY KEY,
  round_id     INT NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  customer_id  INT NOT NULL REFERENCES customers(customer_id),
  delivery_fee NUMERIC(8,2) NOT NULL DEFAULT 0
);

-- รายการอาหาร: qty = จำนวนกล่อง
CREATE TABLE order_items (
  order_id INT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  item_id  INT NOT NULL REFERENCES menu_items(item_id),
  qty      INT NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, item_id)
);

-- ใบงาน
CREATE TABLE job_sheets (
  job_id       SERIAL PRIMARY KEY,
  job_code     VARCHAR(20) NOT NULL UNIQUE,
  round_id     INT NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  rider_id     INT NOT NULL REFERENCES riders(rider_id),
  distance_km  NUMERIC(6,2) NOT NULL DEFAULT 0,
  duration_min INT          NOT NULL DEFAULT 0,
  rider_pay    NUMERIC(8,2) NOT NULL DEFAULT 0,
  UNIQUE (round_id, rider_id)
);

-- ลำดับจุดส่ง
CREATE TABLE job_stops (
  job_id      INT NOT NULL REFERENCES job_sheets(job_id) ON DELETE CASCADE,
  order_id    INT NOT NULL UNIQUE REFERENCES orders(order_id),
  stop_seq    SMALLINT NOT NULL,
  distance_km NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_done     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (job_id, stop_seq)
);

CREATE INDEX idx_orders_round ON orders(round_id);
CREATE INDEX idx_jobs_round   ON job_sheets(round_id);