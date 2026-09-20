import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Order } from '../../core/models/order.model';

const API_BASE = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private http = inject(HttpClient);
  readonly pricePerBox = 65;

  private readonly _orders = signal<Order[]>([]);
  readonly orders = this._orders.asReadonly();

  readonly totalOrders = computed(() => this._orders().length);
  readonly totalBoxes = computed(() => this._orders().reduce((sum, o) => sum + o.boxCount, 0));
  readonly avgBoxPerOrder = computed(() =>
    this.totalOrders() === 0 ? 0 : Math.round((this.totalBoxes() / this.totalOrders()) * 10) / 10
  );

  loadOrders() {
    this.http.get<Order[]>(`${API_BASE}/orders`).subscribe(orders => this._orders.set(orders));
  }

  addOrder(data: { customerName: string; boxCount: number }) {
    const order: Order = {
      id: 'temp-' + Date.now(),
      code: '#LD-temp',
      customerName: data.customerName,
      boxCount: data.boxCount,
      status: 'รอจัดเส้นทาง',
      orderTime: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
    };
    this._orders.update(list => [order, ...list]);
  }

  addSimulatedOrders(count: number, customerNames: string[]) {
    const generated: Order[] = [];
    for (let i = 0; i < count; i++) {
      const name = customerNames[Math.floor(Math.random() * customerNames.length)] ?? 'ลูกค้าไม่ระบุชื่อ';
      const boxCount = 1 + Math.floor(Math.random() * 3);
      generated.push({
        id: 'temp-' + Date.now() + '-' + i,
        code: '#LD-temp' + i,
        customerName: name,
        boxCount,
        status: 'รอจัดเส้นทาง',
        orderTime: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'
      });
    }
    this._orders.update(list => [...generated, ...list]);
    return generated;
  }

  deleteOrder(id: string) {
    const orderId = id.replace('o', '');
    this.http.delete(`${API_BASE}/orders/${orderId}`).subscribe(() => {
      this._orders.update(list => list.filter(o => o.id !== id));
    });
  }
}