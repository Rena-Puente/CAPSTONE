import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  defaultResumenEjecutivo,
  ResumenEjecutivo,
  ResumenEjecutivoMetrics,
  SerieMensual
} from '../../../models/resumen-ejecutivo';
import { ResumenEjecutivoService } from '../../../services/resumen-ejecutivo.service';

interface SerieChartView {
  label: string;
  color: string;
  points: string;
}

interface ChartViewModel {
  labels: string[];
  datasets: SerieChartView[];
  maxValue: number;
}

function isoDateValidator() {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  return Validators.pattern(pattern);
}

function dateRangeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const group = control as ReturnType<FormBuilder['group']>;
    const fechaInicioControl = group.get('fechaInicio');
    const fechaFinControl = group.get('fechaFin');
    if (!fechaInicioControl || !fechaFinControl) {
      return null;
    }

    const start = fechaInicioControl.value;
    const end = fechaFinControl.value;

    if (!start || !end) {
      return null;
    }

    return start <= end ? null : { range: 'La fecha inicio debe ser anterior o igual a la fecha fin.' };
  };
}

@Component({
  selector: 'app-resumen-anual',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './resumen-anual.html',
  styleUrl: './resumen-anual.css'
})
export class ResumenAnual {
  private readonly fb = inject(FormBuilder);
  private readonly resumenService = inject(ResumenEjecutivoService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resumen = signal<ResumenEjecutivo | null>(null);
  protected readonly hasRequested = signal(false);
  protected readonly hasData = computed(() => {
    const data = this.resumen();

    if (!data) {
      return false;
    }

    return (
      data.postulantes_por_mes.length > 0 ||
      data.empresas_por_mes.length > 0 ||
      data.ofertas_por_mes.length > 0 ||
      data.postulaciones_por_mes.length > 0
    );
  });

  protected readonly metricas = computed<ResumenEjecutivoMetrics>(() => {
    const data = this.resumen();
    return {
      avg_postulantes_por_oferta: data?.avg_postulantes_por_oferta ?? 0,
      ofertas_activas: data?.ofertas_activas ?? 0,
      empresas_inactivas: data?.empresas_inactivas ?? 0
    };
  });

  protected readonly chartModel = computed<ChartViewModel | null>(() => {
    const data = this.resumen();

    if (!data) {
      return null;
    }

    const labels = this.buildLabels(data);
    const maxValue = Math.max(
      1,
      ...[
        ...data.postulantes_por_mes.map((item) => item.total),
        ...data.empresas_por_mes.map((item) => item.total),
        ...data.ofertas_por_mes.map((item) => item.total),
        ...data.postulaciones_por_mes.map((item) => item.total)
      ]
    );

    const datasets: SerieChartView[] = [
      {
        label: 'Postulantes',
        color: '#0969da',
        points: this.buildPoints(labels, data.postulantes_por_mes, maxValue)
      },
      {
        label: 'Empresas',
        color: '#1f883d',
        points: this.buildPoints(labels, data.empresas_por_mes, maxValue)
      },
      {
        label: 'Ofertas',
        color: '#bf3989',
        points: this.buildPoints(labels, data.ofertas_por_mes, maxValue)
      },
      {
        label: 'Postulaciones',
        color: '#9a6700',
        points: this.buildPoints(labels, data.postulaciones_por_mes, maxValue)
      }
    ];

    return { labels, datasets, maxValue };
  });

  readonly form = this.fb.nonNullable.group(
    {
      fechaInicio: ['', [Validators.required, isoDateValidator()]],
      fechaFin: ['', [Validators.required, isoDateValidator()]]
    },
    { validators: dateRangeValidator() }
  );

  async consultar(): Promise<void> {
    this.hasRequested.set(true);
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { fechaInicio, fechaFin } = this.form.getRawValue();

    this.loading.set(true);

    try {
      const resumen = await firstValueFrom(this.resumenService.obtenerResumen(fechaInicio, fechaFin));
      this.resumen.set(resumen ?? defaultResumenEjecutivo);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo obtener el resumen ejecutivo.';
      this.error.set(message);
      this.resumen.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected shouldShowError(controlName: 'fechaInicio' | 'fechaFin'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.hasRequested());
  }

  protected getControlError(controlName: 'fechaInicio' | 'fechaFin'): string | null {
    const control = this.form.controls[controlName];

    if (!this.shouldShowError(controlName)) {
      return null;
    }

    if (control.hasError('required')) {
      return 'Este campo es obligatorio.';
    }

    if (control.hasError('pattern')) {
      return 'Usa el formato YYYY-MM-DD.';
    }

    if (this.form.hasError('range')) {
      return 'La fecha de inicio debe ser menor o igual a la fecha de fin.';
    }

    return null;
  }

  protected getRangeError(): string | null {
    if (this.form.hasError('range')) {
      return 'La fecha inicio debe ser anterior o igual a la fecha fin.';
    }

    return null;
  }

  private buildLabels(data: ResumenEjecutivo): string[] {
    const labels = new Set<string>();
    const series = [
      ...data.postulantes_por_mes,
      ...data.empresas_por_mes,
      ...data.ofertas_por_mes,
      ...data.postulaciones_por_mes
    ];

    for (const item of series) {
      labels.add(item.mes);
    }

    return Array.from(labels).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }


    protected getSerieTotal(series: SerieMensual[], mes: string): number {
    return series.find((item) => item.mes === mes)?.total ?? 0;
  }
  private buildPoints(labels: string[], series: SerieMensual[], maxValue: number): string {
    if (labels.length === 0) {
      return '';
    }

    const serieMap = new Map(series.map((item) => [item.mes, item.total]));
    const gap = labels.length > 1 ? 100 / (labels.length - 1) : 0;

    const points = labels.map((label, index) => {
      const x = index * gap;
      const value = serieMap.get(label) ?? 0;
      const y = 95 - (value / maxValue) * 80;
      return `${x},${y}`;
    });

    return points.join(' ');
  }
}
