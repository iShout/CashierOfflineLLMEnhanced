import PropTypes from "prop-types";
import { ProfileOutlined } from "@ant-design/icons";
const RoundButton = ({ className = "", onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`${className} size-20 border-2 flex items-center justify-center border-primary rounded-[40px] bg-white shadow-md cursor-pointer`}
    >
      <div>
        <ProfileOutlined className="text-center text-[32px] text-primary!" />
      </div>
    </div>
  );
};

RoundButton.propTypes = {
  className: PropTypes.string,
  onClick: PropTypes.func,
};
export default RoundButton;
