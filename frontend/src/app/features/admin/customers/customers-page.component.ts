import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../../core/services/customer.service';
import { MockMapComponent, MockMapMarker } from '../../../shared/mock-map/mock-map.component';
import { AddCustomerModalComponent } from './add-customer-modal.component';
import { Customer } from '../../../core/models/customer.model';

@Component({
  selector: 'app-customers-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MockMapComponent, AddCustomerModalComponent],
  templateUrl: './customers-page.component.html',
  styleUrl: './customers-page.component.css'
})
export class CustomersPageComponent {
  searchTerm = signal('');
  showAddModal = signal(false);

  constructor(public customerService: CustomerService) {}

  filteredCustomers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const all = this.customerService.customers();
    if (!term) return all;
    return all.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term));
  });

  mapMarkers = computed<MockMapMarker[]>(() =>
    this.customerService.customers().map((c, i) => ({ id: i + 1, x: 20 + (i % 5) * 15, y: 20 + (i % 3) * 25 }))
  );

  onSaveCustomer(data: Omit<Customer, 'id'>) {
    this.customerService.addCustomer(data);
    this.showAddModal.set(false);
  }

  deleteCustomer(id: string) {
    this.customerService.deleteCustomer(id);
  }
}
