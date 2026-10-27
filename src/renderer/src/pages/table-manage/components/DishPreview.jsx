import PropTypes from "prop-types";
import defaultImage from "@renderer/assets/logo-mark.png";
import { useTranslation } from "react-i18next";

const DishPreview = ({ productDetail, className = "", onClick }) => {
  const { t } = useTranslation();
  const productImage = productDetail.menu_img_url_asset_url || productDetail.detail_img_url_asset_url;

  return (
    <div className={`${className} size-25 border border-primary relative`} onClick={onClick}>
      <div className="w-full h-full flex items-center justify-center">
        {productImage ? (
          <img src={productImage} className="h-full w-full object-cover" alt={t("order.product_image")} />
        ) : (
          <img src={defaultImage} className="w-[36px]" alt={t("order.product_image")} />
        )}
      </div>
      <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/60 flex items-center justify-center">
        <span className="block absolute w-[calc(100%-16px)] text-center text-white font-bold text-[12px] bottom-1.5">
          {productDetail.name}
        </span>
      </div>
    </div>
  );
};

DishPreview.propTypes = {
  productDetail: PropTypes.object,
  className: PropTypes.string,
  onClick: PropTypes.func,
};

export default DishPreview;
