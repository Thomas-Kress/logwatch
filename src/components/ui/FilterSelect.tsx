import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import type { CSSObject } from "@mui/material/styles";

export type FilterOption = { value: string; label: string };

type FilterSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  sx?: CSSObject;
};

export function FilterSelect({
  value,
  onChange,
  options,
  sx,
}: FilterSelectProps) {
  return (
    <FormControl size="small" sx={{ minWidth: 140, ...sx }}>
      <Select
        value={value}
        displayEmpty
        onChange={(event: SelectChangeEvent) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <MenuItem key={option.value || option.label} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
