import { Injectable, computed, signal } from '@angular/core';

const KEY = 'rider_job_code';

@Injectable({ providedIn: 'root' })
export class RiderSessionService {
  jobCode = signal<string | null>(this.read());
  isRider = computed(() => !!this.jobCode());

  private read(): string | null {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  }

  login(code: string) {
    const c = code.trim().toUpperCase();
    try { sessionStorage.setItem(KEY, c); } catch { /* ignore */ }
    this.jobCode.set(c);
  }

  logout() {
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    this.jobCode.set(null);
  }
}