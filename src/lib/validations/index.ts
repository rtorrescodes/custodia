import { z } from 'zod';

export const propertySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  address: z.string().min(5, "La dirección debe ser válida"),
  fraccionamiento: z.string().optional(),
});

export const workOrderSchema = z.object({
  propertyId: z.string().uuid("ID de propiedad inválido"),
  title: z.string().min(3, "El título es muy corto").max(150),
  description: z.string().min(10, "La descripción debe ser más detallada"),
  estimatedCost: z.number().positive().optional(),
});

export const transactionSchema = z.object({
  propertyId: z.string().uuid("ID de propiedad inválido"),
  amount: z.number().positive("El monto debe ser positivo"),
  currency: z.string().length(3, "Moneda inválida (ej. MXN, USD)"),
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().min(2),
  description: z.string().min(5),
});
