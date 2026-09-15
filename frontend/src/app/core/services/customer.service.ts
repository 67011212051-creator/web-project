import { Injectable, signal } from '@angular/core';
import { Customer } from '../models/customer.model';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private nextId = 6;

  private readonly _customers = signal<Customer[]>([
    { id: 'c1', name: 'คุณอรทัย พรมมา', phone: '089-245-7812', address: 'หมู่บ้านเอื้ออาทร ท่าขอนยาง', lat: 16.2458, lng: 103.2506 },
    { id: 'c2', name: 'คุณกิตติศักดิ์ แสงทอง', phone: '081-673-9021', address: 'ถ.ขามเรียง ใกล้ประตู 2 มมส', lat: 16.2487, lng: 103.2531 },
    { id: 'c3', name: 'คุณณัฐณิชา วงศ์คำ', phone: '095-148-3356', address: 'หอพักสุขใจ ต.ขามเรียง', lat: 16.2421, lng: 103.2558 },
    { id: 'c4', name: 'คุณธนกร ศรีบุญเรือง', phone: '086-552-4108', address: 'บ้านดินดำ อ.กันทรวิชัย', lat: 16.2389, lng: 103.2462 },
    { id: 'c5', name: 'คุณพิมพ์ชนก ใจดี', phone: '092-883-7124', address: 'เดอะการ์เดนท์ เรสซิเดนซ์', lat: 16.2513, lng: 103.2480 }
  ]);

  readonly customers = this._customers.asReadonly();

  addCustomer(data: Omit<Customer, 'id'>): Customer {
    const customer: Customer = { id: 'c' + this.nextId++, ...data };
    this._customers.update(list => [...list, customer]);
    return customer;
  }

  updateCustomer(id: string, data: Partial<Customer>) {
    this._customers.update(list => list.map(c => (c.id === id ? { ...c, ...data } : c)));
  }

  deleteCustomer(id: string) {
    this._customers.update(list => list.filter(c => c.id !== id));
  }

  findByName(name: string): Customer | undefined {
    return this._customers().find(c => c.name === name);
  }
}
