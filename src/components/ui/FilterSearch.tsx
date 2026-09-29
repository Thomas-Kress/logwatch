import TextField from "@mui/material/TextField";
import type { CSSObject } from "@mui/material/styles";

type FilterSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  sx?: CSSObject;
};

export function FilterSearch({
  value,
  onChange,
  placeholder,
  sx,
}: FilterSearchProps) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      sx={{ minWidth: 192, flex: 1, ...sx }}
    />
  );
}
