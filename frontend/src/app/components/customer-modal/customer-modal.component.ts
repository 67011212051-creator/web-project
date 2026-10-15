import {
  Component, EventEmitter, Output, AfterViewInit, OnDestroy, ElementRef,
  inject, signal, effect, viewChild,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { getCustomersResponse } from '../../../../models/get-customers-res';
import { environment } from '../../../environments/environment';

const MSU_CENTER: L.LatLngTuple = [16.2466557, 103.2517639];
const MSU_LAT = 16.2467;
const MSU_LNG = 103.2519;
const MAX_RADIUS_KM = 3;

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Component({
  selector: 'app-customer-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './customer-modal.component.html',
  styleUrl: './customer-modal.component.css',
})
export class CustomerModalComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);

  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<getCustomersResponse>();

  name = signal('');
  phone = signal('');
  latitude = signal('');
  longitude = signal('');
  saving = signal(false);
  errorMsg = signal('');

  mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;
  private marker?: L.Marker;
  private resizeObserver?: ResizeObserver;

  constructor() {
    // พิมพ์พิกัดเอง -> ย้ายหมุดตาม
    effect(() => {
      const lat = Number(this.latitude());
      const lng = Number(this.longitude());
      if (!this.map || !this.latitude() || !this.longitude()) return;
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      this.placeMarker(lat, lng, false);
    });
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

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.latitude.set(e.latlng.lat.toFixed(7));
      this.longitude.set(e.latlng.lng.toFixed(7));
      this.errorMsg.set('');
    });

    // modal เพิ่งแสดง ขนาด container อาจยังไม่นิ่ง
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(this.mapEl().nativeElement);
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private placeMarker(lat: number, lng: number, pan: boolean) {
    if (!this.map) return;
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="pick-pin">📍</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        }),
      }).addTo(this.map);
    }
    if (pan) this.map.panTo([lat, lng]);
  }

  useCurrentLocation() {
    if (!navigator.geolocation) {
      this.errorMsg.set('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.latitude.set(pos.coords.latitude.toFixed(7));
        this.longitude.set(pos.coords.longitude.toFixed(7));
        this.map?.setView([pos.coords.latitude, pos.coords.longitude], 16);
        this.errorMsg.set('');
      },
      () => this.errorMsg.set('ไม่สามารถดึงตำแหน่งปัจจุบันได้')
    );
  }

  async onSave() {
    const name = this.name().trim();
    const phone = this.phone().trim();
    const lat = Number(this.latitude());
    const lng = Number(this.longitude());

    if (!name || !phone || !this.latitude() || !this.longitude()) {
      this.errorMsg.set('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
      return;
    }
    if (phone.replace(/-/g, '').length !== 10) {
      this.errorMsg.set('เบอร์โทรต้องเป็นตัวเลข 10 หลัก');
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      this.errorMsg.set('พิกัดไม่ถูกต้อง');
      return;
    }

    // ตรวจสอบระยะทางจาก มมส (ห้ามเกิน 3 กม.)
    const distance = calculateDistanceKm(MSU_LAT, MSU_LNG, lat, lng);
    if (distance > MAX_RADIUS_KM) {
      this.errorMsg.set(`อยู่นอกพื้นที่ให้บริการ (ระยะทาง ${distance.toFixed(2)} กม. เกินรัศมี ${MAX_RADIUS_KM} กม.)`);
      return;
    }

    this.saving.set(true);
    this.errorMsg.set('');
    try {
      const res = await lastValueFrom(
        this.http.post<getCustomersResponse[]>(`${environment.apiUrl}/customers/add`, {
          name, phone, latitude: lat, longitude: lng,
        })
      );
      this.saved.emit(res[0]);
    } catch (e) {
      console.error('Error creating customer:', e);
      this.errorMsg.set(
        (e as HttpErrorResponse).status === 409
          ? 'มีลูกค้านี้อยู่ในระบบแล้ว'
          : 'เกิดข้อผิดพลาดในการบันทึกลูกค้า'
      );
    } finally {
      this.saving.set(false);
    }
  }
}