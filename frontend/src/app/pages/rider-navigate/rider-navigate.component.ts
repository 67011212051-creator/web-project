import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit,
  computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { environment } from '../../../environments/environment';
import { RiderSessionService } from '../../rider-session.service';
import { JobSheet,JobStop } from '../../../../models/rider-job.model';

const SHOP: L.LatLngTuple = [16.2466557, 103.2517639];

@Component({
  selector: 'app-navigate',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './rider-navigate.component.html',
  styleUrl: './rider-navigate.component.css',
})
export class NavigateComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private session = inject(RiderSessionService);

  mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;
  private layer = L.layerGroup();
  private resizeObserver?: ResizeObserver;
  private drawToken = 0;

  job = signal<JobSheet | null>(null);
  index = signal(0);
  finished = signal(false);
  dotsArray = computed(() => Array.from({ length: this.total() }));

  stop = computed(() => this.job()?.stops[this.index()] ?? null);
  total = computed(() => this.job()?.stops.length ?? 0);

  // จุดเริ่มของช่วงนี้: ร้าน (จุดแรก) หรือจุดส่งก่อนหน้า
  private prevPoint = computed<L.LatLngTuple>(() => {
    const prev = this.job()?.stops[this.index() - 1];
    return prev ? [prev.latitude, prev.longitude] : SHOP;
  });

  mapsUrl = computed(() => {
    const s = this.stop();
    return s
      ? `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}&travelmode=driving`
      : '';
  });

  constructor() {
    effect(() => {
      const s = this.stop();
      const from = this.prevPoint();
      if (this.map && s) void this.drawLeg(from, s);
    });
  }

  async ngOnInit() {
    const code = this.session.jobCode();
    if (!code) return;
    try {
      this.job.set(await lastValueFrom(
        this.http.get<JobSheet>(`${environment.apiUrl}/job-sheets/code/${encodeURIComponent(code)}`)
      ));
    } catch {
      this.router.navigate(['/rider']);
    }
  }

  ngAfterViewInit() {
    this.map = L.map(this.mapEl().nativeElement, { zoomControl: false }).setView(SHOP, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.layer.addTo(this.map);

    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(this.mapEl().nativeElement);

    const s = this.stop();
    if (s) void this.drawLeg(this.prevPoint(), s);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private async drawLeg(from: L.LatLngTuple, s: JobStop) {
    if (!this.map) return;
    const token = ++this.drawToken;
    this.layer.clearLayers();

    const to: L.LatLngTuple = [s.latitude, s.longitude];

    L.circleMarker(from, {
      radius: 8, color: '#ffffff', weight: 3, fillColor: '#2b6cb0', fillOpacity: 1,
    }).addTo(this.layer);

    L.marker(to, {
      icon: L.divIcon({
        className: '',
        html: `<div class="nav-pin">${s.stop_seq}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    }).addTo(this.layer);

    let line: L.LatLngTuple[] = [from, to];
    let dashed = true;

    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
      );
      const data = await res.json();
      if (data.routes?.length) {
        line = data.routes[0].geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]] as L.LatLngTuple
        );
        dashed = false;
      }
    } catch { /* ใช้เส้นตรงแทน */ }

    if (token !== this.drawToken) return; // มีการเปลี่ยนจุดไปแล้ว

    L.polyline(line, {
      color: '#2b6cb0', weight: 5, opacity: 0.9, dashArray: dashed ? '8, 8' : undefined,
    }).addTo(this.layer);

    this.map.fitBounds(L.latLngBounds(line), { padding: [50, 50] });
  }

  arrive() {
    if (this.index() + 1 < this.total()) this.index.update((i) => i + 1);
    else this.finished.set(true);
  }
}