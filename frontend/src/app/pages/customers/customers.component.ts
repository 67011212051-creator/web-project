import {
  Component, OnInit, AfterViewInit, OnDestroy, ElementRef,
  inject, signal, computed, effect, viewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { getCustomersResponse } from '../../../../models/get_customers_res';

const MSU_CENTER: L.LatLngTuple = [16.2466557, 103.2517639];

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [],
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.css',
})
export class CustomersComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);

  customers = signal<getCustomersResponse[]>([]);
  search = signal('');

  // กรองตามชื่อหรือเบอร์โทร
  filteredCustomers = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.customers();
    return this.customers().filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.replace(/-/g, '').includes(term.replace(/-/g, ''))
    );
  });

  mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;
  private markers = L.layerGroup();
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const list = this.filteredCustomers();
      if (this.map) this.renderMarkers(list);
    });
  }

  ngOnInit() {
    this.loadCustomers();
  }

  ngAfterViewInit() {
    this.map = L.map(this.mapEl().nativeElement).setView(MSU_CENTER, 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    // วงกลมรัศมีให้บริการ 3 กม.
    L.circle(MSU_CENTER, {
      radius: 3000,
      color: '#d88f16',
      fillColor: '#f4a623',
      fillOpacity: 0.08,
    }).addTo(this.map);

    const shopIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [15, 25],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    L.marker(MSU_CENTER, { icon: shopIcon })
      .bindPopup('<b>📍 ร้านค้า (จุดศูนย์กลางบริการ)</b>')
      .addTo(this.map);

    this.markers.addTo(this.map);
    this.renderMarkers(this.filteredCustomers());

    // ให้ Leaflet คำนวณขนาดใหม่เมื่อ container เปลี่ยนขนาด (เช่น grid ยังไม่นิ่ง)
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(this.mapEl().nativeElement);
  }



  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private renderMarkers(list: getCustomersResponse[]) {
    this.markers.clearLayers();

    list.forEach((c) => {
      const popup = document.createElement('div');
      popup.textContent = `${c.name} (${c.phone})`; // textContent กัน XSS

      L.marker([c.latitude, c.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div class="num-pin">${c.customer_id}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      })
        .bindPopup(popup)
        .addTo(this.markers);
    });
  }

  async loadCustomers() {
    try {
      const data = await lastValueFrom(
        this.http.get<getCustomersResponse[]>('http://localhost:3000/customers')
      );
      this.customers.set(data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  }

  onSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }
}