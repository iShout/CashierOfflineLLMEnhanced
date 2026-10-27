import { Select } from "antd";
import PropTypes from "prop-types";

import { LANGUAGE_ITEMS } from "./languageConfig";

const languageOptions = LANGUAGE_ITEMS.map((language) => ({
  value: language.value,
  label: (
    <span className="inline-flex min-w-0 items-center gap-3">
      <img src={language.icon} alt="" className="h-[14px] w-[21px] shrink-0 object-contain" />
      <span className="truncate">{language.label}</span>
    </span>
  ),
}));

const LanguageSelect = ({ value, onChange, className, style }) => (
  <Select value={value} options={languageOptions} className={className} style={style} onChange={onChange} />
);

LanguageSelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default LanguageSelect;
