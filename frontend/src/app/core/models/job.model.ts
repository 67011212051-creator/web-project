export interface JobStop {
  id: string;
  seq: number;
  customerName: string;
  boxCount: number;
  phone: string;
  address: string;
  etaText: string;
  lat: number;
  lng: number;
  delivered: boolean;
}

export interface RiderJob {
  code: string;
  roundLabel: string;
  totalBoxes: number;
  readyText: string;
  deadlineText: string;
  orderRef?: string;
  stops: JobStop[];
}
