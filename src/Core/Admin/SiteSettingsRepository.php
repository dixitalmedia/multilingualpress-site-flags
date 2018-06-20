<?php # -*- coding: utf-8 -*-
/*
 * This file is part of the MultilingualPress package.
 *
 * (c) Inpsyde GmbH
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Inpsyde\MultilingualPress\Flags\Core\Admin;

use Inpsyde\MultilingualPress\Core\Admin\SiteSettingsRepositoryTrait;

/**
 * Class SiteSettingsRepository
 */
class SiteSettingsRepository
{
    use SiteSettingsRepositoryTrait;

    const KEY_SITE_FLAG_URL = 'flag_url';
    const KEY_SITE_MENU_LANGUAGE_STYLE = 'menu_flag_style';

    /**
     * @param int|null $siteId
     * @return string
     */
    public function siteFlagUrl(int $siteId = null): string
    {
        $siteId = $siteId ?: get_current_blog_id();

        $settings = $this->allSettings();
        $flagUrl = $settings[$siteId][self::KEY_SITE_FLAG_URL] ?? '';

        return $flagUrl;
    }

    /**
     * @param string $url
     * @param int|null $siteId
     * @return bool
     */
    public function updateSiteFlagUrl(string $url, int $siteId = null): bool
    {
        return $this->updateSetting(
            static::KEY_SITE_FLAG_URL,
            $url,
            $siteId
        );
    }

    /**
     * @param int|null $siteId
     * @return string
     */
    public function siteMenuLanguageStyle(int $siteId = null): string
    {
        $siteId = $siteId ?: get_current_blog_id();

        $settings = $this->allSettings();
        $menuFlagStyle = $settings[$siteId][self::KEY_SITE_MENU_LANGUAGE_STYLE] ?? '';

        return $menuFlagStyle;
    }

    /**
     * @param string $style
     * @param int|null $siteId
     * @return bool
     */
    public function updateMenuLanguageStyle(string $style, int $siteId = null): bool
    {
        return $this->updateSetting(
            static::KEY_SITE_MENU_LANGUAGE_STYLE,
            $style,
            $siteId
        );
    }
}
