import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MockMapComponent } from '../../../shared/mock-map/mock-map.component';
import { Customer } from '../../../core/models/customer.model';

@Component({
  selector: 'app-add-customer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MockMapComponent],
  templateUrl: './add-customer-modal.component.html',
  styleUrl: './add-customer-modal.component.css'
})
export class AddCustomerModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Omit<Customer, 'id'>>();

  name = '';
  phone = '';
  address = '';
  lat = 16.2467;
  lng = 103.2519;

  useCurrentLocation() {
    this.lat = 16.2467;
    this.lng = 103.2519;
  }

  onSave() {
    if (!this.name || !this.phone || !this.address) return;
    this.save.emit({ name: this.name, phone: this.phone, address: this.address, lat: this.lat, lng: this.lng });
  }
}
