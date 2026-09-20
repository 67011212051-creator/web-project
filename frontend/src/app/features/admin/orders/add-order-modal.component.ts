import { Component, EventEmitter, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../core/services/customer.service';
import { OrderService } from '../../../core/services/order.service';

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

  constructor(public customerService: CustomerService, private orderService: OrderService) {
    this.selectedCustomerName.set(this.customerService.customers()[0]?.name ?? '');
  }

  selectedCustomer = computed(() => this.customerService.findByName(this.selectedCustomerName()));
  totalPrice = computed(() => this.boxCount() * this.orderService.pricePerBox);

  onSave() {
    if (!this.selectedCustomerName() || this.boxCount() < 1) return;
    this.orderService.addOrder({
      customerName: this.selectedCustomerName(),
      boxCount: this.boxCount()
    });
    this.added.emit();
  }
}