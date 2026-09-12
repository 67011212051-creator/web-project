PRAGMA foreign_keys = ON;

CREATE TABLE stores (
    store_id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_name TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_text TEXT,
    latitude REAL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL CHECK (longitude BETWEEN -180 AND 180),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    sale_price NUMERIC NOT NULL DEFAULT 65 CHECK (sale_price >= 0),
    cost_price NUMERIC NOT NULL DEFAULT 40 CHECK (cost_price >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    store_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    order_date TEXT NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'ASSIGNED',
                'DELIVERING',
                'DELIVERED',
                'CANCELLED'
            )
        ),
    delivery_name TEXT NOT NULL,
    delivery_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_latitude REAL NOT NULL
        CHECK (delivery_latitude BETWEEN -90 AND 90),
    delivery_longitude REAL NOT NULL
        CHECK (delivery_longitude BETWEEN -180 AND 180),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(store_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE order_items (
    order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    FOREIGN KEY (order_id)
        REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)
        REFERENCES products(product_id),
    UNIQUE (order_id, product_id)
);

CREATE TABLE riders (
    rider_id INTEGER PRIMARY KEY AUTOINCREMENT,
    rider_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    vehicle_registration TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1))
);

CREATE TABLE delivery_jobs (
    job_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_code TEXT NOT NULL UNIQUE,
    store_id INTEGER NOT NULL,
    rider_id INTEGER NOT NULL,
    delivery_date TEXT NOT NULL,
    route_color TEXT,
    planned_start_at TEXT NOT NULL,
    planned_end_at TEXT NOT NULL,
    actual_start_at TEXT,
    actual_end_at TEXT,
    rider_call_fee NUMERIC NOT NULL DEFAULT 15
        CHECK (rider_call_fee >= 0),
    total_distance_km NUMERIC NOT NULL DEFAULT 0
        CHECK (total_distance_km >= 0),
    status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (
            status IN (
                'PLANNED',
                'IN_PROGRESS',
                'COMPLETED',
                'CANCELLED'
            )
        ),
    FOREIGN KEY (store_id) REFERENCES stores(store_id),
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id),
    CHECK (datetime(planned_end_at) > datetime(planned_start_at)),
    CHECK (
        datetime(planned_end_at)
        <= datetime(planned_start_at, '+1 hour')
    )
);

CREATE TABLE delivery_stops (
    stop_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL UNIQUE,
    stop_sequence INTEGER NOT NULL
        CHECK (stop_sequence BETWEEN 1 AND 3),
    leg_distance_km NUMERIC NOT NULL DEFAULT 0
        CHECK (leg_distance_km >= 0),
    chargeable_distance_km NUMERIC NOT NULL DEFAULT 0
        CHECK (chargeable_distance_km >= 0),
    delivery_rate NUMERIC NOT NULL DEFAULT 2
        CHECK (delivery_rate >= 0),
    estimated_arrival_at TEXT,
    actual_arrival_at TEXT,
    map_url TEXT,
    delivery_status TEXT NOT NULL DEFAULT 'WAITING'
        CHECK (
            delivery_status IN (
                'WAITING',
                'DELIVERING',
                'DELIVERED',
                'FAILED'
            )
        ),
    FOREIGN KEY (job_id)
        REFERENCES delivery_jobs(job_id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    UNIQUE (job_id, stop_sequence)
);