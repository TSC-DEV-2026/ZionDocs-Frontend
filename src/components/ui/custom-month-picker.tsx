"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, ChevronDown } from "lucide-react";

interface CustomMonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function CustomMonthPicker({
  value,
  onChange,
  placeholder = "Selecionar período",
}: CustomMonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(value ? value.split("-")[0] : "");
  const [selectedMonth, setSelectedMonth] = useState(value ? value.split("-")[1] : "");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - i);

  const months = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const handleApply = () => {
    if (selectedYear && selectedMonth) {
      onChange(`${selectedYear}-${selectedMonth}`);
      setOpen(false);
    }
  };

  const handleClear = () => {
    setSelectedYear("");
    setSelectedMonth("");
    onChange("");
    setOpen(false);
  };

  const getDisplayValue = () => {
    if (!value) return placeholder;
    const [year, month] = value.split("-");
    const monthName = months.find((m) => m.value === month)?.label;
    return `${monthName} ${year}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-auto p-2.5
            bg-white/80 text-[#0b2b14] border-[#cfe8d8]
            hover:bg-white/90 hover:text-[#0b2b14]"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Calendar className="h-4 w-4 flex-shrink-0 text-[#2f4f38]/80" />
            <span className="truncate text-left text-sm text-[#0b2b14]">
              {getDisplayValue()}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-60 flex-shrink-0 text-[#2f4f38]" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[min(calc(100vw-2rem),340px)] p-4
          bg-white/90 backdrop-blur-md border-[#cfe8d8] text-[#0b2b14] rounded-xl shadow-lg"
        align="center"
        sideOffset={6}
        side="bottom"
        avoidCollisions
      >
        <div className="space-y-4">
          <div className="text-sm font-semibold text-[#0b2b14] text-center">
            Selecionar período
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-[#2f4f38]/70">Ano</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-10 bg-white/85 border-[#cfe8d8] text-[#0b2b14]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#cfe8d8] max-h-60">
                  {years.map((year) => (
                    <SelectItem
                      key={year}
                      value={year.toString()}
                      className="text-[#0b2b14] focus:bg-[#e9f8ef]"
                    >
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#2f4f38]/70">Mês</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-10 bg-white/85 border-[#cfe8d8] text-[#0b2b14]">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#cfe8d8] max-h-60">
                  {months.map((month) => (
                    <SelectItem
                      key={month.value}
                      value={month.value}
                      className="text-[#0b2b14] focus:bg-[#e9f8ef]"
                    >
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleApply}
              disabled={!selectedYear || !selectedMonth}
              className="flex-1 h-10 text-white
                bg-gradient-to-r from-[#25601d] to-[#2fa146]
                hover:opacity-95 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Aplicar
            </Button>

            <Button
              onClick={handleClear}
              variant="outline"
              className="flex-1 h-10 bg-white/70 border-[#cfe8d8] text-[#0b2b14]
                hover:bg-[#e9f8ef] hover:text-[#0b2b14]"
            >
              Limpar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}