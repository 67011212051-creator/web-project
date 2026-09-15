import { Component, EventEmitter, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../core/services/customer.service';
import { OrderService } from '../../../core/services/order.service';
import { OrderStatus } from '../../../core/models/order.model';

@Component({
  selector: 'app-add-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-order-modal.component.html',
  styleUrl: './add-order-modal.component.css'
})
export class AddOrderModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() added = new EventEmitter<void>();

  selectedCustomerName = signal('');
  boxCount = signal(2);
  orderTime = signal('');
  menuNote = signal('');
  status = signal<OrderStatus>('รอจัดเส้นทาง');

  constructor(public customerService: CustomerService, private orderService: OrderService) {
    this.selectedCustomerName.set(this.customerService.customers()[0]?.name ?? '');
    this.orderTime.set(this.currentTimeStr());
  }

  selectedCustomer = computed(() => this.customerService.findByName(this.selectedCustomerName()));
  totalPrice = computed(() => this.boxCount() * this.orderService.pricePerBox);

  statusOptions: OrderStatus[] = ['รอจัดเส้นทาง', 'จัดเส้นทางแล้ว', 'กำลังเตรียม', 'ส่งสำเร็จ'];

  private currentTimeStr(): string {
    const d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') + ' น.';
  }

  onSave() {
    if (!this.selectedCustomerName() || this.boxCount() < 1) return;
    this.orderService.addOrder({
      customerName: this.selectedCustomerName(),
      boxCount: this.boxCount(),
      orderTime: this.orderTime(),
      menuNote: this.menuNote(),
      status: this.status()
    });
    this.added.emit();
  }
}
