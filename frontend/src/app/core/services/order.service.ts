import { Injectable, computed, signal } from '@angular/core';
import { Order, OrderStatus } from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private nextSeq = 1049;
  readonly pricePerBox = 65;

  private readonly _orders = signal<Order[]>([
    { id: 'o1', code: '#LD-1048', customerName: 'คุณอรทัย พรมมา', boxCount: 2, status: 'รอจัดเส้นทาง', orderTime: '10:42 น.' },
    { id: 'o2', code: '#LD-1047', customerName: 'คุณกิตติศักดิ์ แสงทอง', boxCount: 1, status: 'รอจัดเส้นทาง', orderTime: '10:36 น.' },
    { id: 'o3', code: '#LD-1046', customerName: 'คุณณัฐณิชา วงศ์คำ', boxCount: 3, status: 'จัดเส้นทางแล้ว', orderTime: '10:31 น.' },
    { id: 'o4', code: '#LD-1045', customerName: 'คุณธนกร ศรีบุญเรือง', boxCount: 2, status: 'กำลังเตรียม', orderTime: '10:24 น.' },
    { id: 'o5', code: '#LD-1044', customerName: 'คุณพิมพ์ชนก ใจดี', boxCount: 1, status: 'ส่งสำเร็จ', orderTime: '10:18 น.' }
  ]);

  readonly orders = this._orders.asReadonly();

  readonly totalOrders = computed(() => this._orders().length);
  readonly totalBoxes = computed(() => this._orders().reduce((sum, o) => sum + o.boxCount, 0));
  readonly avgBoxPerOrder = computed(() =>
    this.totalOrders() === 0 ? 0 : Math.round((this.totalBoxes() / this.totalOrders()) * 10) / 10
  );
  readonly waitingRouteCount = computed(() => this._orders().filter(o => o.status === 'รอจัดเส้นทาง').length);

  addOrder(data: { customerName: string; boxCount: number; orderTime: string; menuNote?: string; status: OrderStatus }): Order {
    const order: Order = { id: 'o' + this.nextSeq, code: '#LD-' + this.nextSeq, ...data };
    this.nextSeq++;
    this._orders.update(list => [order, ...list]);
    return order;
  }

  addSimulatedOrders(count: number, customerNames: string[]) {
    const statuses: OrderStatus[] = ['รอจัดเส้นทาง'];
    const generated: Order[] = [];
    for (let i = 0; i < count; i++) {
      const name = customerNames[Math.floor(Math.random() * customerNames.length)] ?? 'ลูกค้าไม่ระบุชื่อ';
      const boxCount = 1 + Math.floor(Math.random() * 3);
      const order: Order = {
        id: 'o' + this.nextSeq,
        code: '#LD-' + this.nextSeq,
        customerName: name,
        boxCount,
        status: statuses[0],
        orderTime: this.randomTimeBetween(10, 30, 11, 25)
      };
      this.nextSeq++;
      generated.push(order);
    }
    this._orders.update(list => [...generated, ...list]);
    return generated;
  }

  updateStatus(id: string, status: OrderStatus) {
    this._orders.update(list => list.map(o => (o.id === id ? { ...o, status } : o)));
  }

  deleteOrder(id: string) {
    this._orders.update(list => list.filter(o => o.id !== id));
  }

  private randomTimeBetween(h1: number, m1: number, h2: number, m2: number): string {
    const start = h1 * 60 + m1;
    const end = h2 * 60 + m2;
    const t = start + Math.floor(Math.random() * (end - start));
    const hh = Math.floor(t / 60).toString().padStart(2, '0');
    const mm = (t % 60).toString().padStart(2, '0');
    return `${hh}:${mm} น.`;
  }
}
