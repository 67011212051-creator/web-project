CREATE TABLE stores (
    store_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    store_name VARCHAR(150) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DECIMAL(10, 7) NOT NULL CHECK (
        longitude BETWEEN -180 AND 180
    )
);

CREATE TABLE customers (
    customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address_text TEXT,
    latitude DECIMAL(10, 7) CHECK (latitude BETWEEN -90 AND 90),
    longitude DECIMAL(10, 7) CHECK (
        longitude BETWEEN -180 AND 180
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES stores (store_id),
    product_name VARCHAR(150) NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL DEFAULT 65 CHECK (sale_price >= 0),
    cost_price DECIMAL(10, 2) NOT NULL DEFAULT 40 CHECK (cost_price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE orders (
    order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_number VARCHAR(30) NOT NULL UNIQUE,
    store_id BIGINT NOT NULL REFERENCES stores (store_id),
    customer_id BIGINT NOT NULL REFERENCES customers (customer_id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN (
            'PENDING',
            'ASSIGNED',
            'DELIVERING',
            'DELIVERED',
            'CANCELLED'
        )
    ),
    delivery_name VARCHAR(150) NOT NULL,
    delivery_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_latitude DECIMAL(10, 7) NOT NULL CHECK (
        delivery_latitude BETWEEN -90 AND 90
    ),
    delivery_longitude DECIMAL(10, 7) NOT NULL CHECK (
        delivery_longitude BETWEEN -180 AND 180
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    order_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    unit_cost DECIMAL(10, 2) NOT NULL CHECK (unit_cost >= 0),
    UNIQUE (order_id, product_id)
);

CREATE TABLE riders (
    rider_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rider_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    vehicle_registration VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE delivery_jobs (
    job_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_code VARCHAR(40) NOT NULL UNIQUE,
    store_id BIGINT NOT NULL REFERENCES stores (store_id),
    rider_id BIGINT NOT NULL REFERENCES riders (rider_id),
    delivery_date DATE NOT NULL,
    route_color VARCHAR(20),
    planned_start_at TIMESTAMPTZ NOT NULL,
    planned_end_at TIMESTAMPTZ NOT NULL,
    actual_start_at TIMESTAMPTZ,
    actual_end_at TIMESTAMPTZ,
    rider_call_fee DECIMAL(10, 2) NOT NULL DEFAULT 15,
    total_distance_km DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (
        status IN (
            'PLANNED',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED'
        )
    ),
    CHECK (
        planned_end_at > planned_start_at
    ),
    CHECK (
        planned_end_at <= planned_start_at + INTERVAL '1 hour'
    ),
    CHECK (total_distance_km >= 0)
);

CREATE TABLE delivery_stops (
    stop_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES delivery_jobs (job_id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL UNIQUE REFERENCES orders (order_id),
    stop_sequence INTEGER NOT NULL CHECK (stop_sequence BETWEEN 1 AND 3),
    leg_distance_km DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (leg_distance_km >= 0),
    chargeable_distance_km DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (chargeable_distance_km >= 0),
    delivery_rate DECIMAL(10, 2) NOT NULL DEFAULT 2 CHECK (delivery_rate >= 0),
    estimated_arrival_at TIMESTAMPTZ,
    actual_arrival_at TIMESTAMPTZ,
    map_url TEXT,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'WAITING' CHECK (
        delivery_status IN (
            'WAITING',
            'DELIVERING',
            'DELIVERED',
            'FAILED'
        )
    ),
    UNIQUE (job_id, stop_sequence)
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to customers" ON customers;
DROP POLICY IF EXISTS "Allow public access to stores" ON stores;
DROP POLICY IF EXISTS "Allow public access to products" ON products;
DROP POLICY IF EXISTS "Allow public access to orders" ON orders;
DROP POLICY IF EXISTS "Allow public access to order_items" ON order_items;
DROP POLICY IF EXISTS "Allow public access to riders" ON riders;
DROP POLICY IF EXISTS "Allow public access to delivery_jobs" ON delivery_jobs;
DROP POLICY IF EXISTS "Allow public access to delivery_stops" ON delivery_stops;

CREATE POLICY "Allow public read access to customers"
    ON customers
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow public access to stores"
    ON stores
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow public access to products"
    ON products
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow public access to orders"
    ON orders
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow public access to order_items"
    ON order_items
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow public access to riders"
    ON riders
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow public access to delivery_jobs"
    ON delivery_jobs
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY "Allow public access to delivery_stops"
    ON delivery_stops
    FOR ALL
    TO anon, authenticated
    USING (TRUE)
    WITH CHECK (TRUE);