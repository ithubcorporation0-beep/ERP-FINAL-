"use client";

import { useId } from "react";
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

/** Accessibility props to spread onto the input so label, hint and error are announced. */
export interface FormControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

interface FormFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> {
  control: Control<TValues>;
  name: TName;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
  render: (props: {
    field: ControllerRenderProps<TValues, TName>;
    control: FormControlProps;
  }) => React.ReactNode;
}

/**
 * One labelled form row wired to React Hook Form: label, input, optional hint and validation error.
 *
 * ```tsx
 * <FormField control={form.control} name="email" label="Email" required
 *   render={({ field, control }) => <Input type="email" {...field} {...control} />} />
 * ```
 */
export function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  label,
  description,
  required,
  className,
  render,
}: FormFieldProps<TValues, TName>) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = Boolean(fieldState.error);
        const describedBy = [description ? descriptionId : null, invalid ? errorId : null]
          .filter(Boolean)
          .join(" ");
        return (
          <Field data-invalid={invalid} className={className}>
            <FieldLabel htmlFor={id}>
              {label}
              {required ? (
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              ) : null}
            </FieldLabel>
            {render({
              field,
              control: {
                id,
                "aria-invalid": invalid,
                "aria-describedby": describedBy || undefined,
                "aria-required": required || undefined,
              },
            })}
            {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
            <FieldError id={errorId} errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}
