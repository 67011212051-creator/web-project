import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { inject, signal } from '@angular/core';
import { getOrdersResponse } from '../../../../models/get-orders-res';
import { lastValueFrom } from 'rxjs';


@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})

export class OrdersComponent {

  http = inject(HttpClient);
  orders = signal<getOrdersResponse[]>([]);

  ngOnInit() {
    this.callApi();
  }


  async callApi() {
    const res = await lastValueFrom(
      this.http.get('http://localhost:3000/orders'),
    );
    this.orders.set(res as getOrdersResponse[]);
    
    console.log(this.orders());
    console.log('API call finished');
  }




}
