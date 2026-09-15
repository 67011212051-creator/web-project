export type OrderStatus = 'รอจัดเส้นทาง' | 'จัดเส้นทางแล้ว' | 'กำลังเตรียม' | 'ส่งสำเร็จ';

export interface Order {
  id: string;
  code: string;
  customerName: string;
  boxCount: number;
  status: OrderStatus;
  orderTime: string;
  menuNote?: string;
}
