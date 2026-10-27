import { MenuFoldOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import VerticalMenu from "./VerticalMenu";
import { useNavigate } from "react-router";

/**
 * 所有页面上的header组件
 * @param {*} params 「currentTitle: 当前页面的title；onTopPage：当前页面是否处于一级页面； leftSlot：左边插槽； rightSlot：右边插槽」
 * @returns
 */
function Header({ currentTitle = "No Title", onTopPage = true, backPath = "/", leftSlot = <></>, rightSlot = <></> }) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isMenuClosing, setMenuClosing] = useState(false);
  const closeTimerRef = useRef(null);

  const navigate = useNavigate();

  const closeMenu = () => {
    if (!isMenuOpen || isMenuClosing) return;
    setMenuClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 180);
  };

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    // 侧边菜单打开时锁住页面滚动，避免小窗口下背景滚动导致遮罩和菜单底部错位。
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  return (
    <div>
      <div className="h-16"></div>
      <div className="fixed top-0 left-0 z-50 flex justify-between items-center w-full bg-white px-4 h-16 border-b border-[#DEDEDE]">
        {isMenuOpen && (
          <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/40" onClick={closeMenu}></div>
            <div
              className={`absolute inset-y-0 left-0 bg-white shadow-2xl ${
                isMenuClosing ? "slide-out-left" : "slide-in-left"
              }`}
            >
              <VerticalMenu className="h-full" onItemClick={closeMenu}></VerticalMenu>
            </div>
          </div>
        )}
        <div className="flex flex-1 items-center">
          {onTopPage ? (
            <MenuFoldOutlined
              className="text-[22.5px] mr-2 cursor-pointer"
              onClick={() => {
                if (isMenuOpen) {
                  closeMenu();
                } else {
                  setMenuOpen(true);
                }
              }}
            />
          ) : (
            <ArrowLeftOutlined className="text-[22.5px] mr-2 cursor-pointer" onClick={() => navigate(backPath)} />
          )}
          <div>{leftSlot}</div>
        </div>

        <div className="flex items-center justify-center flex-none">
          <span className="text-[21px] text-[#202020]" style={{ fontWeight: 500 }}>
            {currentTitle}
          </span>
          <div className="w-2"></div>
        </div>

        <div className="text-right flex-1">{rightSlot}</div>
      </div>
    </div>
  );
}

Header.propTypes = {
  currentTitle: PropTypes.string,
  onTopPage: PropTypes.boolean,
  backPath: PropTypes.string,
  leftSlot: PropTypes.node,
  rightSlot: PropTypes.node,
};

export default Header;
