-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.riders (
  rider_id integer NOT NULL DEFAULT nextval('riders_rider_id_seq'::regclass),
  rider_code character varying NOT NULL UNIQUE,
  route_color character varying NOT NULL,
  max_orders smallint NOT NULL DEFAULT 3,
  CONSTRAINT riders_pkey PRIMARY KEY (rider_id)
);
CREATE TABLE public.customers (
  customer_id integer NOT NULL DEFAULT nextval('customers_customer_id_seq'::regclass),
  name character varying NOT NULL,
  phone character varying NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  CONSTRAINT customers_pkey PRIMARY KEY (customer_id)
);
CREATE TABLE public.orders (
  order_id integer NOT NULL DEFAULT nextval('orders_order_id_seq'::regclass),
  customer_id integer NOT NULL,
  delivery_fee numeric NOT NULL DEFAULT 0,
  qty smallint NOT NULL,
  date date NOT NULL DEFAULT '2024-01-01'::date,
  CONSTRAINT orders_pkey PRIMARY KEY (order_id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id)
);
CREATE TABLE public.job_sheets (
  job_id integer NOT NULL DEFAULT nextval('job_sheets_job_id_seq'::regclass),
  job_code character varying NOT NULL UNIQUE,
  rider_id integer NOT NULL,
  distance_km numeric NOT NULL DEFAULT 0,
  duration_min integer NOT NULL DEFAULT 0,
  rider_pay numeric NOT NULL DEFAULT 0,
  CONSTRAINT job_sheets_pkey PRIMARY KEY (job_id),
  CONSTRAINT job_sheets_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(rider_id)
);
CREATE TABLE public.job_stops (
  job_id integer NOT NULL,
  order_id integer NOT NULL UNIQUE,
  stop_seq smallint NOT NULL,
  distance_km numeric NOT NULL DEFAULT 0,
  CONSTRAINT job_stops_pkey PRIMARY KEY (job_id, stop_seq),
  CONSTRAINT job_stops_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job_sheets(job_id),
  CONSTRAINT job_stops_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id)
);