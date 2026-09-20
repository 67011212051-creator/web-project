
export type OrderStatus = string;

export interface Order {
  id: string;
  code: string;
  customerName: string;
  boxCount: number;
}
